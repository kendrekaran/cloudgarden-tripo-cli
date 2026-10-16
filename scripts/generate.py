"""Resumable, sequential Tripo generation. No automatic resubmission on failure."""
import json, subprocess, pathlib, sys, datetime
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'asset-sources'
LEDGER = ROOT / 'asset-ledger.json'
STYLE = 'Natural storybook realism, organic shapes, detailed matte PBR textures, muted earthy colors, isolated single game asset, no text, no pedestal. '
PROMPTS = {
 'lantern': 'A small ancient garden lantern carved from mossy gray stone, squat square base, four slender stone pillars around a single amber crystal, peaked weathered stone roof. Open sides reveal the amber crystal. Natural storybook realism, isolated single prop, no ground. ',
 'explorer': 'Full body young adult human explorer, short dark brown hair, teal green tunic, ochre yellow short neck scarf, fitted brown trousers and brown leather boots. Friendly expressive face, elegant storybook proportions. Neutral T pose, straight legs slightly apart, arms horizontal, open hands, all fingers separated. No props. ',
 'island': 'Floating meadow island terrain, circular broad gently domed grassy olive green top, mostly flat walkable surface, exposed dark gray rock cliffs and tapered rugged rocky underside. Top is 5 times wider than total height. Bare terrain only, no trees, no structures, no sky. ',
 'grass': 'One small tuft of lush meadow grass, 25 separate very thin curved flat pointed green blades with tapered tips, irregular organic silhouette, moss green with pale dry tips, no dirt base, no pot. ',
 'bridge': 'Straight weathered wooden footbridge section with flat plank walkway and wooden post rope handrails on both long sides. Open unobstructed ends, rectangular floor, six times longer than wide, rustic brown aged timber. No terrain. ',
 'grass-tall': 'One tuft of tall wild meadow grass with thin long arching green leaves and six delicate golden seed heads, natural irregular arrangement, no soil base, no pot. ',
 'flowers-white': 'Small clump of six wild white daisies with yellow centers, slender stems at different heights and sparse small green leaves, natural delicate meadow flowers, no pot, no ground base. ',
 'flowers-purple': 'Small clump of three purple meadow lupine flower stalks with many tiny lilac blossoms and green finger shaped leaves, delicate realistic wildflowers, no pot or ground. ',
 'fern': 'A single lush green woodland fern with seven arching fronds radiating outwards, delicate individual leaflets, natural light green new growth, no pot, no ground base. ',
 'rock': 'A single irregular weathered dark gray basalt boulder, layered rough stone with subtle olive green moss in crevices, low wide asymmetrical silhouette. ',
 'volcano': 'Small dormant miniature volcano, low wide cone of dark gray weathered basalt with vertical ridges and a clear circular recessed crater at top, natural rugged rocky surface, no lava, no smoke, no ground base. ',
 'shed': 'Tiny rustic open front garden shelter, slanted timber roof, weathered dark brown plank back wall, four wooden posts, open doorway and visible empty wooden floor, a little ochre clay pot on one side. No ground base. ',
 'fence': 'Short rustic wooden garden fence section, three rough vertical aged timber posts connected by two horizontal weathered planks, simple natural brown wood, no ground base. ',
 'shrine': 'Ancient small garden shrine carved from moss covered gray stone, squat plinth with shallow steps supporting a pointed standing stone with a circular inset glowing amber glass jewel, elegant simple fantasy relic, organic weathered stone, no writing. ',
 'path': 'Thin flat irregular rectangular patch of worn warm brown earth footpath with scattered tiny pebbles, rough natural dirt texture, feathered uneven edges, length three times width, no grass, no pedestal. ',
 'cloud': 'One very wide flattened bank of fluffy white cumulus clouds, softly rounded organic billowing forms merging together, warm ivory above and pale blue gray underneath, no ground, no other objects. '
}
def call(args, name):
    p = subprocess.run(['tripo', *args, '--json', '--no-open'], text=True, capture_output=True)
    (SOURCES / (name + '.log')).write_text(p.stderr + '\n' + p.stdout)
    if p.returncode: raise RuntimeError(f'{name} failed ({p.returncode}); inspect log; do not blindly resubmit')
    return json.loads(p.stdout.strip().splitlines()[-1])
def readledger():
    return json.loads(LEDGER.read_text()) if LEDGER.exists() else {'budget':500,'initial_balance':1000,'jobs':{},'note':'All visible physical models originated in Tripo; Blender produces optimized derivatives.'}
def save(data): LEDGER.write_text(json.dumps(data,indent=2))
def charge_guard(estimate):
    b=call(['balance'],'balance')
    spent=1000-float(b['balance'])
    if spent + float(b.get('frozen',0)) + estimate > 500: raise RuntimeError('500-credit budget guard: stopping before submission')
def main():
    names=sys.argv[1:] or list(PROMPTS)
    data=readledger()
    for name in names:
        if name in data['jobs']: print('SKIP',name,flush=True); continue
        charge_guard(20)
        prompt=STYLE+PROMPTS[name]
        args=['make',prompt,'-p','texture=true','-p','pbr=true','-p','texture_quality=standard','--name','cloudgarden-'+name,'--out',str(SOURCES/name)]
        dry=call(args+['--dry-run'],name+'-dry')
        if not dry.get('valid'): raise RuntimeError(str(dry))
        print('GENERATING',name,flush=True)
        result=call(args,name)
        data=readledger()
        data['jobs'][name]={'prompt':prompt,'dry_run':dry,'result':result,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        data['total_credits']=sum(float(x['result'].get('credits_consumed',0)) for x in data['jobs'].values())
        save(data)
        print('DONE',name,'credits',result.get('credits_consumed'),'total',data['total_credits'],flush=True)
if __name__=='__main__': main()
