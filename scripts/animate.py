from generate import *
def record(name,result):
 d=readledger();d['jobs'][name]={'result':result};d['total_credits']=sum(float(x['result'].get('credits_consumed',0)) for x in d['jobs'].values());save(d)
 print('DONE',name,'credits',result.get('credits_consumed'),flush=True)
d=readledger();source=d['jobs']['explorer']['result']['task_id']
if 'explorer-check' not in d['jobs']:
 result=call(['anim','check',source,'--out',str(SOURCES/'explorer-check')],'explorer-check');record('explorer-check',result)
 print(json.dumps(result),flush=True)
d=readledger()
check=call(['task','get',d['jobs']['explorer-check']['result']['task_id']],'explorer-check-detail')
if check.get('output',{}).get('riggable') is not True:
 raise RuntimeError('Model is not riggable: stop before spending rig credits')
if 'explorer-rig-compat' not in d['jobs']:
 charge_guard(25);result=call(['anim','rig',source,'--rig-type','biped','--spec','mixamo','-p','model=rig-v1.0','--out-format','glb','--out',str(SOURCES/'explorer-rig-compat')],'explorer-rig-compat');record('explorer-rig-compat',result)
d=readledger()
if 'explorer-animated' not in d['jobs']:
 charge_guard(30)
 result=call(['anim','retarget',d['jobs']['explorer-rig-compat']['result']['task_id'],'--animation','preset:biped:idle','preset:biped:walk','preset:biped:run','--out-format','glb','--animate-in-place','--out',str(SOURCES/'explorer-animated')],'explorer-animated');record('explorer-animated',result)
