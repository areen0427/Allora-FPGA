#!/usr/bin/env python3
"""Read LiteX platform declarations with a restricted AST evaluator (never import/execute them).
Emit evidence snapshots for review. Does not grant toolchain capabilities or infer clock rates.
"""
import argparse, ast, hashlib, json, operator, pathlib, re
OPS={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Pow:operator.pow}
class Unsupported(Exception): pass
class Reader:
 def __init__(self, path):
  self.path=path; self.tree=ast.parse(path.read_text()); self.env={}; self.functions={}; self.warnings=[]
  for n in self.tree.body:
   if isinstance(n,ast.FunctionDef): self.functions[n.name]=n
  for n in self.tree.body:
   if isinstance(n,(ast.Assign,ast.AnnAssign)):
    try:
     value=self.eval(n.value,self.env)
     targets=n.targets if isinstance(n,ast.Assign) else [n.target]
     for t in targets:
      if isinstance(t,ast.Name): self.env[t.id]=value
    except (Unsupported,KeyError,TypeError,ValueError,IndexError): pass
 def eval(self,n,e):
  if isinstance(n,ast.Constant): return n.value
  if isinstance(n,ast.Name):
   if n.id in e: return e[n.id]
   raise Unsupported(n.id)
  if isinstance(n,(ast.List,ast.Tuple)):
   result=[]
   for x in n.elts:
    if isinstance(x,ast.Starred):
     try:result.extend(self.eval(x.value,e))
     except (Unsupported,KeyError,TypeError,ValueError):self.warnings.append(f'Dynamic extension at line {x.lineno} is not statically expanded.')
    else:result.append(self.eval(x,e))
   return result
  if isinstance(n,ast.Dict): return {self.eval(k,e):self.eval(v,e) for k,v in zip(n.keys,n.values)}
  if isinstance(n,ast.BinOp) and type(n.op) in OPS: return OPS[type(n.op)](self.eval(n.left,e),self.eval(n.right,e))
  if isinstance(n,ast.UnaryOp) and isinstance(n.op,ast.USub): return -self.eval(n.operand,e)
  if isinstance(n,ast.Compare) and len(n.ops)==1:
   left=self.eval(n.left,e);right=self.eval(n.comparators[0],e)
   if isinstance(n.ops[0],ast.Eq):return left==right
   if isinstance(n.ops[0],ast.NotEq):return left!=right
   if isinstance(n.ops[0],ast.In):return left in right
   if isinstance(n.ops[0],ast.NotIn):return left not in right
  if isinstance(n,ast.IfExp):return self.eval(n.body if self.eval(n.test,e) else n.orelse,e)
  if isinstance(n,ast.Subscript): return self.eval(n.value,e)[self.eval(n.slice,e)]
  if isinstance(n,ast.JoinedStr): return ''.join(str(self.eval(x.value,e)) if isinstance(x,ast.FormattedValue) else x.value for x in n.values)
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Name):
   name=n.func.id
   if name in ['str','int','float','list','tuple']:
    return {'str':str,'int':int,'float':float,'list':list,'tuple':list}[name](*[self.eval(x,e) for x in n.args])
   if name in ['Pins','Subsignal','IOStandard','Misc','Drive','Inverted','PlatformInfo']:
    return {'kind':name,'args':[self.eval(x,e) for x in n.args]}
   if name in self.functions:
    fn=self.functions[name];local=dict(e)
    defaults=fn.args.defaults; args=fn.args.args
    for a,d in zip(args[len(args)-len(defaults):],defaults): local[a.arg]=self.eval(d,e)
    for a,v in zip(args,n.args): local[a.arg]=self.eval(v,e)
    for k in n.keywords: local[k.arg]=self.eval(k.value,e)
    for stmt in fn.body:
     if isinstance(stmt,ast.Assign):
      for t in stmt.targets:
       if isinstance(t,ast.Name):local[t.id]=self.eval(stmt.value,local)
     if isinstance(stmt,ast.Return): return self.eval(stmt.value,local)
   raise Unsupported(name)
  raise Unsupported(ast.dump(n)[:90])
 def snapshot(self, io_name=None, connector_names=None):
  attrs={}
  for cls in self.tree.body:
   if isinstance(cls,ast.ClassDef) and cls.name=='Platform':
    for n in cls.body:
     if isinstance(n,ast.Assign):
      try:
       for t in n.targets:
        if isinstance(t,ast.Name):attrs[t.id]=self.eval(n.value,{**self.env,**attrs})
      except (Unsupported,KeyError,TypeError,ValueError):pass
  selected=io_name or ('_io' if '_io' in self.env else None)
  io=[]
  if selected:
   for part in selected.split('+'):io+=self.env.get(part,[]) if part else []
  if not io and not io_name and '_get_io' in self.functions:
   try:
    expression='_get_io(IOStandard("LVCMOS25"))' if self.path.stem=='sitlinv_xc7k420t' else '_get_io()'
    io=self.eval(ast.parse(expression,mode='eval').body,self.env); selected=expression
   except (Unsupported,KeyError,TypeError,ValueError):pass
  url='https://github.com/litex-hub/litex-boards/blob/master/litex_boards/platforms/'+self.path.name
  pins=[]
  warnings=list(dict.fromkeys(self.warnings))
  def add_resource(resource):
   if not isinstance(resource,list) or len(resource)<3 or not isinstance(resource[0],str):return
   resource_name,index,*attrs_=resource
   common_io=next((x['args'][0] for x in attrs_ if isinstance(x,dict) and x['kind']=='IOStandard'),None)
   def add(parts, signal, inherited_io):
    std=next((x['args'][0] for x in parts if isinstance(x,dict) and x['kind']=='IOStandard'),inherited_io)
    for x in parts:
     if not isinstance(x,dict):continue
     if x['kind']=='Subsignal':add(x['args'][1:],signal+'_'+str(x['args'][0]),std)
     if x['kind']=='Pins':
      if not all(isinstance(a,str) for a in x['args']):continue # Pins(integer) declares an internal primitive width, never a package pad.
      pads=' '.join(x['args']).split()
      for bit,pad in enumerate(pads):
       if not re.fullmatch(r'(?:[A-Za-z]*[0-9]+|IO_[A-Z]{2}_[AB][0-9]+)',pad):continue
       name=f'{resource_name}_{index}'+(signal[len(resource_name):] if signal!=resource_name else '')+(f'_{bit}' if len(pads)>1 else '')
       kind='clock' if resource_name.startswith('clk') else 'led' if re.search(r'(?:^|_)leds?(?:_|$)|^led[0-9]*$',resource_name) and not re.search(r'alnum|alphanum|seven|segment',resource_name) else 'button' if ('btn' in resource_name or resource_name in ['cpu_reset','cpu_reset_n','user_button']) else 'uart' if resource_name in ['serial','uart'] else 'flash' if 'flash' in resource_name else 'i2c' if 'i2c' in resource_name else 'spi' if resource_name.startswith('spi') else 'gpio'
       p={'name':name,'signal':signal+(str(bit) if len(pads)>1 else ''),'pin':pad,'type':kind,'group':resource_name.replace('_',' ').title(),'verified':True,'sourceUrl':url}
       if resource_name in ['user_sw','user_dip_btn']:
        p['type']='gpio';p['group']='Switches'
       if std:p['ioStandard']=std
       # Signal spelling (_n may mean north or a differential leg) never proves polarity.
       if any(isinstance(a,dict) and a['kind']=='Inverted' for a in parts):p['activeLow']=True
       pins.append(p)
   add(attrs_,resource_name,common_io)
  for resource in io:add_resource(resource)
  # Connector numbering follows LiteX's zero-based string/list declarations or explicit dictionary keys.
  if connector_names is None:
   connector_names=['_connectors']
   if io_name and '+' not in io_name and io_name.startswith('_io_') and '_connectors_'+io_name[4:] in self.env:connector_names=['_connectors_'+io_name[4:]]
  connector_rows=[]
  for connector_name in connector_names:connector_rows+=self.env.get(connector_name,[])
  for connector in connector_rows:
   if not isinstance(connector,list) or len(connector)<2:continue
   name=connector[0];values=connector[1]
   contacts=values.items() if isinstance(values,dict) else enumerate(' '.join(str(v) for v in connector[1:]).split())
   for contact,pad in contacts:
    if not isinstance(pad,str) or not re.fullmatch(r'(?:[A-Za-z]*[0-9]+|IO_[A-Z]{2}_[AB][0-9]+)',pad):continue
    pins.append({'name':f'{name}:{contact}','signal':f'{name}_{contact}','pin':pad,'type':'gpio','group':f'Connector {name}','verified':True,'sourceUrl':url})
  # Upstream TODO/unverified declarations are evidence of an unresolved mapping, not verification.
  text=self.path.read_text()
  for node in ast.walk(self.tree):
   if not isinstance(node,ast.Tuple) or len(node.elts)<3:continue
   try:resource=self.eval(node.elts[0],self.env)
   except (Unsupported,KeyError,TypeError):continue
   segment='\n'.join(text.splitlines()[node.lineno-1:node.end_lineno])
   if re.search(r'TODO.*(?:verify|test|check)|not verified|unverified|untested|broken',segment,re.I):
    for p in pins:
     if p['signal']==resource or p['signal'].startswith(str(resource)+'_'):p['verified']=False
    warnings.append(f'{resource}: upstream marks this declaration TODO/unverified; excluded from automatic constraints.')

  names={}
  for p in pins:names[p['name']]=names.get(p['name'],0)+1
  for p in pins:
   if names[p['name']]>1:p['name']+='_'+p['pin']
  clock_name=attrs.get('default_clk_name');period=attrs.get('default_clk_period');clock=None
  matches=[p for p in pins if p['signal']==clock_name or p['signal']==str(clock_name)+'_p']
  if clock_name and isinstance(period,(float,int)) and period>0:
   clock={'name':clock_name,'frequency':round(1e9/period),'verified':bool(matches) and matches[0]['verified'],'sourceUrl':url}
   if matches:
    clock['pin']=matches[0]['pin']
    if matches[0].get('ioStandard'):clock['ioStandard']=matches[0]['ioStandard']
    negative=next((p for p in pins if p['signal']==clock_name+'_n'),None)
    if negative:clock['differentialPin']=negative['pin']
  additional=[]
  for node in ast.walk(self.tree):
   if not isinstance(node,ast.Call) or not isinstance(node.func,ast.Attribute) or node.func.attr!='add_period_constraint' or len(node.args)<2:continue
   requested=node.args[0]
   if not isinstance(requested,ast.Call) or not requested.args:continue
   try:name=self.eval(requested.args[0],self.env);period=self.eval(node.args[1],self.env)
   except (Unsupported,KeyError,TypeError,ValueError):continue
   if not isinstance(name,str) or not isinstance(period,(float,int)) or period<=0 or name==clock_name:continue
   match=next((p for p in pins if p['signal']==name or p['signal']==name+'_p'),None)
   if not match or match['type']!='clock':continue
   c={'name':name,'pin':match['pin'],'frequency':round(1e9/period),'verified':match['verified'],'sourceUrl':url}
   if match.get('ioStandard'):c['ioStandard']=match['ioStandard']
   negative=next((p for p in pins if p['signal']==name+'_n'),None)
   if negative:c['differentialPin']=negative['pin']
   if not any(x['name']==name for x in additional):additional.append(c)
  return {'additionalClocks':additional,'platform':self.path.stem,'declaration':selected,'connectorDeclarations':connector_names,'warnings':warnings,'sha256':hashlib.sha256(self.path.read_bytes()).hexdigest(),'sourceUrl':url,'clock':clock,'pins':pins,'declarations':[k for k in self.env if k.startswith('_io')]}
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('platforms',type=pathlib.Path);a.add_argument('--out',type=pathlib.Path,required=True);args=a.parse_args()
 result={}
 for p in sorted(args.platforms.glob('*.py')):
  try: result[p.stem]=Reader(p).snapshot()
  except (SyntaxError,Unsupported,ValueError,TypeError,KeyError) as e: result[p.stem]={'error':str(e)}
 args.out.write_text(json.dumps(result,indent=2)+'\n')
 print(f'{len(result)} platforms; {sum(bool(x.get("pins")) for x in result.values())} default IO sets; {sum(bool(x.get("clock")) for x in result.values())} explicit default clocks')
