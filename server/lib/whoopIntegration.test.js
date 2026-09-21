'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {
  WhoopIntegration,
  SCOPES,
  DEFAULT_REDIRECT_URI,
  sleepMs,
  sleepNeedMs,
  hours,
  kcal
}=require('./whoopIntegration.js');

assert.ok(SCOPES.includes('offline'));
['read:recovery','read:cycles','read:sleep','read:workout','read:profile','read:body_measurement']
  .forEach(scope=>assert.ok(SCOPES.includes(scope)));

assert.strictEqual(sleepMs({
  total_light_sleep_time_milli:3600000,
  total_slow_wave_sleep_time_milli:1800000,
  total_rem_sleep_time_milli:1800000
}),7200000);

assert.strictEqual(sleepNeedMs({
  baseline_milli:25200000,
  need_from_sleep_debt_milli:1800000,
  need_from_recent_strain_milli:900000,
  need_from_recent_nap_milli:-900000
}),27000000);

assert.strictEqual(hours(7200000),2);
assert.ok(Math.abs(kcal(418.4)-100)<0.0001);

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dgos-whoop-test-'));
try{
  const whoop=new WhoopIntegration({
    WHOOP_CLIENT_SECRET:'test-secret',
    WHOOP_REDIRECT_URI:DEFAULT_REDIRECT_URI,
    DGOS_APP_URL:'https://dgos.example.test',
    DGOS_PUBLIC_BASE_URL:'https://dgos.example.test',
    DGOS_INTEGRATION_ENCRYPTION_KEY:'11'.repeat(32),
    DGOS_PRIVATE_DATA_DIR:dir
  });
  assert.strictEqual(whoop.configured,true);
  assert.strictEqual(whoop.connected,false);
  const url=new URL(whoop.authorizationUrl());
  assert.strictEqual(url.origin,'https://api.prod.whoop.com');
  assert.strictEqual(url.pathname,'/oauth/oauth2/auth');
  assert.strictEqual(url.searchParams.get('redirect_uri'),DEFAULT_REDIRECT_URI);
  assert.strictEqual(url.searchParams.get('state').length,8);
  const scopes=(url.searchParams.get('scope')||'').split(' ');
  SCOPES.forEach(scope=>assert.ok(scopes.includes(scope)));
  assert.ok(fs.existsSync(path.join(dir,'whoop-tokens.enc.json')));
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}

console.log('WHOOP integration unit tests: OK');
