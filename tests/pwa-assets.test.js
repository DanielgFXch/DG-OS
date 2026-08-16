'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');

test('every manifest icon points to a real repository asset',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  for(const icon of manifest.icons){
    assert.equal(fs.existsSync(path.resolve(root,icon.src)),true,`missing ${icon.src}`);
  }
});

test('service worker caches the shared Brain and Event sources used by the dashboard',()=>{
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  for(const asset of ['./marketBrain.js','./events.js','./app.js','./icon-192.png','./icon-512.png']){
    assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});
