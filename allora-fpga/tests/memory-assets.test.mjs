import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { convertBinary, convertPixels, parseTable, rom, toHex, memory, parseAssetManifest } from '../src/lib/memoryAssets.ts';

test('image row-major conversion, threshold, alpha and deterministic indexed palette', () => {
  const rgba = new Uint8ClampedArray([255,0,0,255, 0,255,0,255, 0,0,255,0, 0,0,255,255]);
  const mono = convertPixels(rgba,2,2,{mode:'mono',threshold:128,alpha:'transparent-black'});
  assert.deepEqual(mono.image.words,[0n,1n,0n,0n]);
  assert.equal(toHex(mono.image),'0\n1\n0\n0\n');
  const indexed = convertPixels(rgba,2,2,{mode:'indexed',threshold:128,alpha:'transparent-black'});
  assert.deepEqual(indexed.palette.words,[0n,31n,2016n,63488n]);
  assert.deepEqual(indexed.image.words,[3n,2n,0n,1n]);
  assert.equal(toHex(indexed.image),'03\n02\n00\n01\n');
  const white = convertPixels(rgba,2,2,{mode:'rgb565',threshold:128,alpha:'transparent-white'});
  assert.equal(white.image.words[2],65535n);
  const photo = new Uint8ClampedArray(300*4);
  for (let i=0;i<300;i++) photo.set([i%256,Math.floor(i/2),Math.floor(i/3),255],4*i);
  const reduced = convertPixels(photo,300,1,{mode:'indexed',threshold:128,alpha:'transparent-black'});
  assert.ok(reduced.palette.depth <= 256);
  assert.deepEqual(convertPixels(photo,300,1,{mode:'indexed',threshold:128,alpha:'transparent-black'}).image.words,reduced.image.words);
});
test('binary byte order, offset and final padding', () => {
  const bytes = Uint8Array.of(0,0x12,0x34,0x56);
  assert.deepEqual(convertBinary(bytes,{wordWidth:16,byteOrder:'big',offset:1,padding:'zero'}).words,[0x1234n,0x5600n]);
  assert.deepEqual(convertBinary(bytes,{wordWidth:16,byteOrder:'little',offset:1,padding:'zero'}).words,[0x3412n,0x56n]);
  const padded=convertBinary(bytes,{wordWidth:16,byteOrder:'big',offset:1,padding:'zero'});
  assert.equal(padded.logicalSize,24);
  assert.equal(padded.paddedSize,32);
  assert.throws(() => convertBinary(bytes,{wordWidth:16,byteOrder:'big',offset:1,padding:'reject'}));
  assert.throws(() => convertBinary(bytes,{wordWidth:7,byteOrder:'big',offset:0,padding:'zero'}));
});
test('fixed point boundaries, rounding, overflow and quantization error', () => {
  const options={column:0,header:false,signed:true,wordWidth:8,fractionalBits:2,rounding:'nearest',overflow:'reject'};
  const {image,rows}=parseTable('-1.375\n31.75',options);
  assert.deepEqual(image.words,[0xfbn,0x7fn]);
  assert.equal(rows[0].quantized,-1.25);
  assert.equal(rows[0].error,0.125);
  assert.throws(() => parseTable('32',options),/Overflow/);
  assert.equal(parseTable('32',{...options,overflow:'saturate'}).image.words[0],0x7fn);
  assert.equal(parseTable('32',{...options,overflow:'wrap'}).image.words[0],0x80n);
  assert.equal(parseTable('-1.375',{...options,rounding:'floor'}).image.words[0],0xfan);
  assert.deepEqual(parseTable('value\n1.5',{...options,header:true}).image.words,[6n]);
});
test('generated ROM compiles and simulates synchronous reads, depth one and out-of-range', () => {
  const check=spawnSync('iverilog',['-V'],{encoding:'utf8'});
  assert.equal(check.status,0,'Icarus Verilog is required for this test');
  const dir=mkdtempSync(join(tmpdir(),'allora-memory-'));
  try {
    for (const [depth, words, expected] of [[1,[0xabn],['ab','00']],[3,[0x12n,0x34n,0x56n],['12','34','56','00']]]) {
      const image=memory(words,8,words.length);
      const addrWidth=Math.max(1,Math.ceil(Math.log2(depth)));
      writeFileSync(join(dir,`d${depth}.hex`),toHex(image));
      writeFileSync(join(dir,`d${depth}.v`),rom(`d${depth}`,image,`d${depth}.hex`));
      const actions=expected.map((value,index)=>`addr=${index}; #2; if (data !== previous) $fatal(1,"latency"); clk=1; #1; if(data !== 8'h${value}) $fatal(1,"address ${index}"); previous=data; clk=0; #1;`).join('\n');
      writeFileSync(join(dir,`tb${depth}.v`),`module tb; reg clk=0; reg [${addrWidth-1}:0] addr=0; wire [7:0] data; reg [7:0] previous; d${depth}_rom dut(clk,addr,data); initial begin clk=1; #1; previous=data; clk=0; #1; ${actions} $finish; end endmodule`);
      const compile=spawnSync('iverilog',['-g2012','-s','tb','-o',`out${depth}`,`d${depth}.v`,`tb${depth}.v`],{cwd:dir,encoding:'utf8'});
      assert.equal(compile.status,0,compile.stderr);
      const run=spawnSync('vvp',[`out${depth}`],{cwd:dir,encoding:'utf8'});
      assert.equal(run.status,0,run.stdout+run.stderr);
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('both existing Studio entries route to the dedicated workspace', () => {
  const root = join(import.meta.dirname,'../src');
  const home = readFileSync(join(root,'pages/welcome/HomeView.tsx'),'utf8');
  const dashboard = readFileSync(join(root,'pages/Dashboard.tsx'),'utf8');
  const app = readFileSync(join(root,'App.tsx'),'utf8');
  assert.match(home,/onClick=\{\(\) => onChoose\("memory-asset-studio"\)\}/);
  assert.match(home,/path === "memory-asset-studio"/);
  assert.match(dashboard,/<MemoryAssetStudio projectPath=/);
  assert.match(app,/initialSection=\{registerLaunch \? "register-builder" : studioLaunch \? "memory-asset-studio"/);
  assert.match(app,/onCreateMemoryProject=\{\(\) => \{ setStudioLaunch\(true\); setSelectedBoardId\(null\); setStage\("memory-project-setup"\)/);
  assert.match(app,/<MemoryProjectSetup board=/);
});

test('project-style generated memory is accessible to Yosys synthesis', () => {
  assert.equal(spawnSync('yosys',['-V'],{encoding:'utf8'}).status,0,'Yosys is required for this test');
  const dir=mkdtempSync(join(tmpdir(),'allora-memory-synth-'));
  const generated=join(dir,'src','generated');
  try {
    mkdirSync(generated,{recursive:true});
    const image=memory([0x12n,0x34n,0x56n],8,3);
    writeFileSync(join(generated,'asset.hex'),toHex(image));
    writeFileSync(join(generated,'asset.v'),rom('asset',image,'src/generated/asset.hex'));
    writeFileSync(join(dir,'top.v'),`module top(input clk,input [1:0] addr,output [7:0] data); asset_rom r(clk,addr,data); endmodule`);
    const run=spawnSync('yosys',['-Q','-q','-p','read_verilog src/generated/asset.v top.v; hierarchy -check -top top; proc; memory_collect; stat'],{cwd:dir,encoding:'utf8'});
    assert.equal(run.status,0,run.stdout+run.stderr);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('generated ROM reads project memory in Verilator simulation', () => {
  assert.equal(spawnSync('verilator',['--version'],{encoding:'utf8'}).status,0,'Verilator is required for this test');
  const dir=mkdtempSync(join(tmpdir(),'allora-memory-verilator-'));
  const generated=join(dir,'src','generated');
  try {
    mkdirSync(generated,{recursive:true});
    const image=memory([0x12n,0x34n,0x56n],8,3);
    writeFileSync(join(generated,'asset.hex'),toHex(image));
    writeFileSync(join(generated,'asset.v'),rom('asset',image,'src/generated/asset.hex'));
    writeFileSync(join(dir,'tb.sv'),`module tb; reg clk=0; reg [1:0] addr=0; wire [7:0] data; asset_rom dut(clk,addr,data); initial begin #1; clk=1; #1; if(data!==8'h12) $fatal(1,"rom 0"); clk=0; addr=2; #1; clk=1; #1; if(data!==8'h56) $fatal(1,"rom 2"); clk=0; addr=3; #1; clk=1; #1; if(data!==8'h00) $fatal(1,"out of range"); $finish; end endmodule`);
    const compile=spawnSync('verilator',['--binary','--timing','--top-module','tb','-Wno-fatal','-o','sim','src/generated/asset.v','tb.sv'],{cwd:dir,encoding:'utf8'});
    assert.equal(compile.status,0,compile.stdout+compile.stderr);
    const run=spawnSync(join(dir,'obj_dir','sim'),[],{cwd:dir,encoding:'utf8'});
    assert.equal(run.status,0,run.stdout+run.stderr);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test('malformed metadata cannot address unrelated or shared project files', () => {
  const asset = {id:'asset-1', name:'Example', kind:'binary', source:'assets/sources/data.bin', sourceHash:'a'.repeat(64), options:{wordWidth:8, byteOrder:'big', offset:0, padding:'zero'}, outputs:[{path:'src/generated/data.hex',hash:'b'.repeat(64)}]};
  const parse = assets => parseAssetManifest(JSON.stringify({schemaVersion:1, assets}));
  assert.deepEqual(parse([asset]).assets,[asset]);
  assert.throws(() => parse([null]));
  assert.throws(() => parse([{...asset,outputs:[null]}]));
  assert.throws(() => parse([{...asset,source:'src/top.v'}]));
  assert.throws(() => parse([{...asset,source:'assets/sources/../../top.v'}]));
  assert.throws(() => parse([{...asset,outputs:[{path:'src/top.v',hash:'b'.repeat(64)}]}]));
  assert.throws(() => parse([asset,asset]));
  assert.throws(() => parse([asset,{...asset,id:'asset-2',source:'assets/sources/second.bin'}]));
});

test('oversized memories and fractional image dimensions are rejected', () => {
  assert.throws(() => convertBinary(new Uint8Array(1_000_001), {wordWidth:8,byteOrder:'big',offset:0,padding:'zero'}), /million/);
  for (const width of [0, 1.5, NaN, Infinity]) assert.throws(() => convertPixels(new Uint8ClampedArray(4), width, 1, {mode:'mono',threshold:128,alpha:'transparent-black'}), /Invalid/);
  assert.throws(() => parseTable('1', {column:0,header:false,signed:false,wordWidth:1.5,fractionalBits:0,rounding:'nearest',overflow:'reject'}), /Invalid/);
});
