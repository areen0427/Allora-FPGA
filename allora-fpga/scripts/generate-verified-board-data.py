#!/usr/bin/env python3
"""Regenerate reviewed resource snapshots. See docs/boards/BOARD_DATA_AUDIT.md."""
import argparse,importlib.util,pathlib,json,re,subprocess,sys
sys.dont_write_bytecode=True
parser=argparse.ArgumentParser(description='Generate reviewed catalog evidence from pinned LiteX sources without executing upstream code.')
parser.add_argument('--upstream',type=pathlib.Path,required=True,help='LiteX git checkout at the reviewed revision')
parser.add_argument('--supplied',type=pathlib.Path,required=True,help='Owner-supplied LiteX snapshot for historical declarations')
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[2];script=root/'allora-fpga/scripts/import-board-platforms.py';spec=importlib.util.spec_from_file_location('reader',script);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
current=args.upstream.resolve();local=args.supplied.resolve();commit=subprocess.check_output(['git','-C',str(current),'rev-parse','HEAD'],text=True).strip()
selections={'trenz_mf_c10lp_001':'_io_10CL055','trenz_mf_max10_001':'_io_MAX1000','trenz_mf001_intel':'_io_MAX1000','analog_pocket':'_io_physical_litex+_io_fpga2fpga_litex','colorlight_5a_75b':'_io_v7_0','colorlight_5a_75e':'_io_v7_1','logicbone':'_io_rev0','qmtech_wukong':'_io_common+_io_v1','ice_v_wireless':'_io_v0','icepi_zero':'_io_common','ulx3s':'_io_common+_io_2_0','digilent_zybo_z7':'_io+_io_z7+_io_z7_20','redpitaya':'_io+_io_14'}
for name in ['konfekt','kopflos','minze','mozart_ml2','mozart_mx1','mozart_mx2','noir','vanille']:selections['machdyne_'+name]='_io_vx+_io_v0'
selections['machdyne_lakritz']='_io_vx';selections['machdyne_schoko']='_io_vx+_io_v1'
manual={'colorlight_i5:v7.0':('colorlight_i5','_io_v7_0'),'colorlight_i5a_907:v7.0':('colorlight_i5a_907','_io_v7_0'),'gsd_orangecrab:r0.2':('gsd_orangecrab','_io_r0_2'),'icebreaker_bitsy:v0':('icebreaker_bitsy','_io_v0'),'icebreaker_bitsy:v1':('icebreaker_bitsy','_io_v1')}
sources=set(re.findall(r'^    "?source"?: "([^" ]+)"',(root/'allora-fpga/src/data/boards/litexCatalog.ts').read_text(),re.M))
sources.update('icebreaker ulx3s tinyfpga_bx kosagi_fomu_pvt muselab_icesugar colorlight_i9plus gsd_butterstick lambdaconcept_ecpix5 muselab_icesugar_pro sipeed_tang_nano_9k sipeed_tang_nano_20k ice_v_wireless lattice_ice40up5k_evn icepi_zero lattice_ecp5_evn lattice_versa_ecp5 trellisboard kosagi_netv2 sqrl_acorn sqrl_fk33 digilent_arty xilinx_ac701'.split())
result={};audit=[]
for key in sorted(sources|set(manual)):
 platform,selection=manual.get(key,(key,selections.get(key)));platform='radiona_ulx3s' if platform=='ulx3s' else platform;directory=current if (current/'litex_boards/platforms'/f'{platform}.py').exists() else local
 p=directory/'litex_boards/platforms'/f'{platform}.py'
 if not p.exists():audit.append({'platform':key,'status':'source missing'});continue
 reader=m.Reader(p)
 connectors=['_connectors','_connectors_z7'] if platform=='digilent_zybo_z7' else ['_connectors_vx'] if platform.startswith('machdyne_') and '_connectors_vx' in reader.env else None
 snapshot=reader.snapshot(selection,connectors)
 if platform in ['machdyne_mozart_ml1','machdyne_vivaldi_ml1']:
  p=local/'litex_boards/platforms'/f'{platform}.py';directory=local;reader=m.Reader(p);snapshot=reader.snapshot('_io_vx+_io_v2',['_connectors_vx'])

 # Dynamic default list with revision selected by the platform's own defaults.
 if platform=='gsd_butterstick':snapshot=reader.snapshot('_io_r1_0')
 url=snapshot['sourceUrl'].replace('/master/','/'+commit+'/') if directory==current else snapshot['sourceUrl']
 pins=snapshot['pins'];clock=snapshot['clock']
 if platform=='fpgawars_alhambra2':
  for pin in pins:
   if pin['name'] in ['sw1_0','sw2_0']:pin['type']='button';pin['group']='User Buttons'
  snapshot['warnings'].append('SW1/SW2 are the two general-purpose pushbuttons documented by the FPGAwars maker hardware description; polarity not inferred.')
 if platform in ['trenz_cr00010','trenz_smf2000'] and clock:
  clock['frequency']=12000000
  snapshot['warnings'].append('Nominal 12 MHz source; upstream default period is rounded to 83 ns and must not be presented as a 12.048193 MHz oscillator.')
 if platform=='trenz_tem0006' and clock:
  clock['verified']=False
  snapshot['warnings'].append('Upstream gives a rounded 83 ns constraint for clk12; verify the physical oscillator nominal before using this as a source frequency.')
 if platform=='redpitaya':
  clock={'name':'clk125','pin':'U18','differentialPin':'U19','frequency':125000000,'ioStandard':'DIFF_HSTL_I_18','verified':True,'sourceUrl':url}

 # Clock descriptors already contain the sole validated default period; never reuse it for another named pad.
 if clock and not clock.get('pin'):clock=None
 if clock:clock['sourceUrl']=url
 for c in snapshot.get('additionalClocks',[]):c['sourceUrl']=url
 for pin in pins:pin.pop('sourceUrl',None)
 result[key]={'source':{'url':url,'label':'LiteX platform '+platform,'revision':commit if directory==current else 'user-supplied snapshot (SHA-256 below)','sha256':snapshot['sha256']},'clock':clock,'additionalClocks':snapshot.get('additionalClocks',[]),'pins':[[pin['name'],pin['signal'],pin['pin'],pin['type'],pin['group'],pin.get('activeLow'),pin.get('ioStandard'),pin['verified']] for pin in pins],'notes':snapshot['warnings'],'declaration':snapshot['declaration'],'connectorDeclarations':snapshot['connectorDeclarations']}
 audit.append({'platform':key,'status':'parsed' if pins else 'no statically resolved base IO','pins':len(pins),'clock':clock,'declaration':snapshot['declaration'],'connectorDeclarations':snapshot['connectorDeclarations'],'source':result[key]['source'],'warnings':snapshot['warnings']})
out=root/'allora-fpga/src/data/boards/verifiedPlatformData.ts'
out.write_text('// Generated from reviewed LiteX platform declarations. See docs/boards/BOARD_DATA_AUDIT.md.\n// LiteX-Boards sources are BSD-2-Clause; copyright stays with their respective authors.\nimport type { BoardPin, BoardClock, BoardDefinition } from "../boardTypes";\n\ntype PlatformData = { source: NonNullable<BoardDefinition["sources"]>[number]; clock: BoardClock | null; additionalClocks: BoardClock[]; pins: [string, string, string, BoardPin["type"], string, boolean | null, string | null, boolean][]; notes: string[]; declaration: string | null; connectorDeclarations: string[] };\nexport const VERIFIED_PLATFORM_DATA: Record<string, PlatformData> = {\n'+',\n'.join('  '+json.dumps(k)+': '+json.dumps(v,separators=(',',':')) for k,v in result.items())+'\n};\n\nexport function getVerifiedPlatform(key: string) {\n  const data = VERIFIED_PLATFORM_DATA[key];\n  if (!data) return undefined;\n  return { ...data, pins: data.pins.map(([name, signal, pin, type, group, activeLow, ioStandard, verified]): BoardPin => ({ name, signal, pin, type, group, ...(activeLow === null ? {} : { activeLow }), ...(ioStandard === null ? {} : { ioStandard }), verified })) };\n}\n')
(root/'docs/boards/platform-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print('keys',len(result),'pins',sum(len(v['pins']) for v in result.values()),'bytes',out.stat().st_size)
