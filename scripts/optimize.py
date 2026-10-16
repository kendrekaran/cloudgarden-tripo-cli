"""Run with Blender --background --python scripts/optimize.py -- [asset ids].
All meshes and textures are derivatives of the recorded Tripo source models.
"""
import bpy, pathlib, json, sys, math, bmesh
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[1]
TARGETS={'lantern':2500,'explorer':18000,'island':18000,'grass':1800,'grass-tall':1800,'flowers-white':1200,'flowers-purple':1200,'fern':1600,'rock':1300,'volcano':3500,'shed':5000,'bridge':4500,'fence':900,'shrine':3500,'path':300,'cloud':1000}
ledger=json.loads((ROOT/'asset-ledger.json').read_text())
outdir=ROOT/'public/assets';outdir.mkdir(exist_ok=True,parents=True)
manifest_path=outdir/'manifest.json'
manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
names=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(TARGETS)
for name in names:
 if name not in ledger['jobs']: print('NOT READY',name,flush=True);continue
 source_job='explorer-animated' if name=='explorer' and 'explorer-animated' in ledger['jobs'] else name
 result=ledger['jobs'][source_job]['result']
 source=result.get('model_file')
 if not source:
  files=list((ROOT/'asset-sources'/source_job).rglob('*.glb'))
  if not files: print('NO GLB',name);continue
  source=str(files[0])
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=source)
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 if name=='explorer':
  for arm in [o for o in bpy.context.scene.objects if o.type=='ARMATURE']:arm.data.pose_position='REST'
  for obj in meshes:
   bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
   tri=sum(len(p.vertices)-2 for p in obj.data.polygons)
   if tri>TARGETS[name]:
    dec=obj.modifiers.new('Skinned mesh browser budget','DECIMATE');dec.ratio=TARGETS[name]/tri
    bpy.ops.object.modifier_move_to_index(modifier=dec.name,index=0)
    bpy.ops.object.modifier_apply(modifier=dec.name)
  for arm in [o for o in bpy.context.scene.objects if o.type=='ARMATURE']:arm.data.pose_position='POSE'
 # Consolidate static asset transforms into mesh coordinates.
 if name!='explorer':
  bpy.ops.object.select_all(action='DESELECT')
  for obj in meshes:obj.select_set(True)
  bpy.context.view_layer.objects.active=meshes[0]
  bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  if len(meshes)>1:bpy.ops.object.join()
  obj=bpy.context.view_layer.objects.active;meshes=[obj]
  points=[v.co for v in obj.data.vertices]
  lo=Vector([min(v[k] for v in points) for k in range(3)])
  hi=Vector([max(v[k] for v in points) for k in range(3)])
  size=hi-lo;mid=(lo+hi)/2
  # Normalized island: radius 1, ground around z=0, cliffs down to -.32.
  for v in obj.data.vertices:
   if name=='island':
    x=(v.co.x-mid.x)/(size.x/2);y=(v.co.y-mid.y)/(size.y/2)
    h=(v.co.z-lo.z)/max(size.z,.0001)
    # Preserve the generated topology: monotonic height compression cannot
    # fold individual surface triangles as a flat cutoff can.
    z=(h-.82)*(.14 if h>.60 else .40)
    v.co=Vector((x,y,z))
   else:
    v.co-=Vector((mid.x,mid.y,lo.z))
  # Bridge longest horizontal direction becomes Blender Y (glTF Z).
  if name in ['bridge','path','fence'] and size.x>size.y:
   for v in obj.data.vertices:v.co.x,v.co.y=-v.co.y,v.co.x
  # Tripo separates many coincident vertices along normal/UV boundaries.
  # Weld geometry before collapse; loop UVs remain intact. Otherwise each
  # disconnected patch collapses independently and leaves visible cracks.
  bm=bmesh.new();bm.from_mesh(obj.data)
  bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=max(size)*.00003)
  bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
  bm.to_mesh(obj.data);bm.free()
  if name in ['grass','grass-tall','flowers-white','flowers-purple','fern']:
   bm=bmesh.new();bm.from_mesh(obj.data)
   height=max(v.co.z for v in bm.verts)
   basefaces=[f for f in bm.faces if all(v.co.z<height*.08 for v in f.verts)]
   bmesh.ops.delete(bm,geom=basefaces,context='FACES')
   bm.to_mesh(obj.data);bm.free()
  tri=sum(len(p.vertices)-2 for p in obj.data.polygons)
  target=TARGETS[name]
  if tri>target:
   dec=obj.modifiers.new('Browser mesh budget','DECIMATE');dec.ratio=target/tri
   bpy.context.view_layer.objects.active=obj
   bpy.ops.object.modifier_apply(modifier=dec.name)
  for p in obj.data.polygons:p.use_smooth=True
  # Imported custom normals are invalid after terrain fitting / decimation.
  if obj.data.has_custom_normals:
   bpy.context.view_layer.objects.active=obj
   bpy.ops.mesh.customdata_custom_splitnormals_clear()
 # Resize source textures locally without another API call.
 for im in bpy.data.images:
  if im.type=='IMAGE' and im.size[0]>0:
   cap=2048 if name in ['explorer','island'] else (512 if name in ['grass','grass-tall','flowers-white','flowers-purple','fern','cloud','path'] else 1024)
   w,h=im.size
   if max(w,h)>cap:im.scale(max(1,int(w*cap/max(w,h))),max(1,int(h*cap/max(w,h))))
   try:im.pack()
   except:pass
 for obj in meshes:
  for mat in obj.data.materials:
   if mat and mat.use_nodes:
    bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if bsdf:bsdf.inputs['Roughness'].default_value=.9;bsdf.inputs['Metallic'].default_value=0
 export=str(outdir/(name+'.glb'))
 bpy.ops.export_scene.gltf(filepath=export,export_format='GLB',export_image_format='JPEG',export_jpeg_quality=85,export_animations=True,export_animation_mode='ACTIONS',export_skins=True)
 allp=[obj.matrix_world@Vector(v) for obj in meshes for v in obj.bound_box]
 lo=[min(v[k] for v in allp) for k in range(3)];hi=[max(v[k] for v in allp) for k in range(3)]
 manifest[name]={'url':'/assets/'+name+'.glb','sourceTaskId':result.get('task_id'),'sourceModel':str(pathlib.Path(source).resolve().relative_to(ROOT)),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'bytes':pathlib.Path(export).stat().st_size,'blenderBounds':{'min':lo,'max':hi},'collision':'terrain' if name=='island' else ('bridge' if name=='bridge' else 'decorative'),'animations':[a.name for a in bpy.data.actions] if name=='explorer' else []}
 manifest_path.write_text(json.dumps(manifest,indent=2))
 print('OPTIMIZED',name,manifest[name]['triangles'],manifest[name]['bytes'],flush=True)
