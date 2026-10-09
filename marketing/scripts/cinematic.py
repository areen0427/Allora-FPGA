#!/usr/bin/env python3
"""Render authentic fullscreen capture using an editable, eased camera timeline."""
import json, subprocess, pathlib, argparse, shutil
ROOT = pathlib.Path(__file__).resolve().parents[1]
def run(args):
    subprocess.run(args, check=True)
def probe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
def curve(keys, index):
    expr = str(keys[-1][index])
    for a,b in reversed(list(zip(keys,keys[1:]))):
        u=f'max(0,min(1,(on/60-{a[0]})/{b[0]-a[0]}))'
        ease=f'({u}*{u}*(3-2*{u}))'
        value=f'({a[index]}+({b[index]}-{a[index]})*{ease})'
        expr=f'if(lt(on/60,{b[0]}),{value},{expr})'
    return expr

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--timeline',default=str(ROOT/'demos/cinematic.timeline.json'))
    parser.add_argument('--capture',action='store_true',help='Record the real fullscreen app before rendering')
    parser.add_argument('--only',help='Re-render one changed shot while reusing the others')
    parser.add_argument('--reuse-shots',default='',help='Comma-separated shot markers to preserve as already rendered')
    parser.add_argument('--reuse-logo',action='store_true',help='Preserve the existing rendered logo ending')
    args=parser.parse_args()
    if args.capture:
        run(['node',str(ROOT/'scripts/record.mjs'),'cinematic-fullscreen'])
        for extension in ['mp4','json']:
            shutil.copyfile(ROOT/f'raw/cinematic-fullscreen.{extension}',ROOT/f'raw/cinematic-intro.{extension}')
        shutil.copytree(ROOT/'.cache/project',ROOT/'.cache/cinematic-project',dirs_exist_ok=True)
        run(['node',str(ROOT/'scripts/record.mjs'),'cinematic-physical'])
        shutil.copytree(ROOT/'.cache/project',ROOT/'.cache/cinematic-project',dirs_exist_ok=True)
    timeline=json.loads(pathlib.Path(args.timeline).read_text())
    workflow_frames=sum(round(shot['seconds']*60) for shot in timeline['shots'])
    total_frames=workflow_frames+300
    source=ROOT/'raw/cinematic-intro.mp4'
    journal=json.loads(source.with_suffix('.json').read_text())
    markers={s['name']:s['time'] for s in journal['shots']}
    metadata=probe(source);stream=metadata['streams'][0];w,h=stream['width'],stream['height']
    work=ROOT/'.cache/cinematic';work.mkdir(parents=True,exist_ok=True)
    clips=[]
    for n,shot in enumerate(timeline['shots']):
        output=work/f'{n:02}.mp4';clips.append(output)
        if shot['marker'] in args.reuse_shots.split(','):
            if not output.exists(): raise FileNotFoundError(output)
            continue
        if args.only and args.only != shot['marker'] and output.exists():
            continue
        shot_source=ROOT/'raw'/shot.get('source','cinematic-intro.mp4')
        shot_markers=markers
        if shot_source != source and shot['marker'] != 'timing':
            shot_markers={s['name']:s['time'] for s in json.loads(shot_source.with_suffix('.json').read_text())['shots']}
        start=shot.get('source_start', (0 if shot['marker']=='timing' else shot_markers[shot['marker']])+shot.get('offset',0))
        seconds=shot['seconds'];frames=round(seconds*60)
        keys=shot['camera'];z=curve(keys,3);cx=curve(keys,1);cy=curve(keys,2)
        vf=f"fps=60,trim=start={start:.6f}:duration={shot['source_seconds']},setpts=(PTS-STARTPTS)*{seconds/shot['source_seconds']},fps=60,zoompan=z='{z}':x='max(0,min(iw-iw/zoom,iw*({cx})-iw/zoom/2))':y='max(0,min(ih-ih/zoom,ih*({cy})-ih/zoom/2))':d=1:s={w}x{h}:fps=60"
        # Temporal exposure samples follow actual camera motion, creating directional trails.
        if shot.get('blur'):
            vf+=",tmix=frames=3:weights='1 2 4':enable='"+'+'.join(f'between(t,{a},{b})' for a,b in shot['blur'])+"'"
        vf+=f',tpad=stop_mode=clone:stop_duration={seconds}'
        run(['ffmpeg','-v','error','-threads','4','-i',str(shot_source),'-vf',vf,'-frames:v',str(frames),'-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-y',str(output)])
        print(f'Rendered {shot["marker"]}',flush=True)
    logo=work/'logo.mp4';clips.append(logo)
    asset=ROOT/'../allora-fpga/public/logo.png'
    # Place the supplied logo on black; 300 frames are exactly five seconds.
    filt=f"scale=640:640:flags=lanczos,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='1.12-0.12*(on/299)*(on/299)*(3-2*on/299)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={w}x{h}:fps=60,fade=t=out:st=4.7:d=0.3"
    if args.reuse_logo and not logo.exists(): raise FileNotFoundError(logo)
    if not args.reuse_logo:
        run(['ffmpeg','-v','error','-loop','1','-i',str(asset),'-vf',filt,'-frames:v','300','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-y',str(logo)])
    concat=work/'concat.txt';concat.write_text(''.join(f"file '{p}'\n" for p in clips))
    landscape=ROOT/'output/allora-cinematic-landscape.mp4'
    run(['ffmpeg','-v','error','-f','concat','-safe','0','-i',str(concat),'-c','copy','-an','-movflags','+faststart','-y',str(landscape)])
    portrait=ROOT/'output/allora-cinematic-tiktok.mp4'
    run(['ffmpeg','-v','error','-i',str(landscape),'-vf','fps=60,scale=1080:-2:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setpts=N/(60*TB)','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-frames:v',str(total_frames),'-r','60','-fps_mode','cfr','-video_track_timescale','60000','-movflags','+faststart','-y',str(portrait)])
    reports={}
    for p in [landscape,portrait]:
        info=probe(p);video=info['streams'][0]
        assert len(info['streams'])==1
        assert video['codec_name']=='h264' and video['avg_frame_rate']=='60/1'
        assert int(video['nb_frames'])==total_frames
        reports[p.name]=info
    (ROOT/'output/cinematic-qa.json').write_text(json.dumps({'capture':metadata,'exports':reports,'logoFrames':300,'workflowFrames':workflow_frames},indent=2))
if __name__=='__main__':main()
