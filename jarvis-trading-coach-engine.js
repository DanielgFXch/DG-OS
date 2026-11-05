'use strict';
/* DG OS · personal Trading Coach evidence engine.
 * Labels are the owner's preferences, NOT proof of profitability.
 * No chart observations, trade directions or broker operations are fabricated.
 * Pure module for the Jarvis view, voice summary and Node regression tests.
 */
(function(root,factory){
  const engine=factory();
  if(typeof module==='object' && module.exports)module.exports=engine;
  if(root && root.document)root.DGOSTradingCoachEngine=engine;
})(typeof window!=='undefined'?window:globalThis,function(){
  const ENUMS=Object.freeze({
    label:['good','avoid','missed'],
    side:['buy','sell','watch'],
    session:['asia','london','new_york','zvieri','other'],
    timeframe:['m1','m5','m15','h1','h4','d1'],
    liquidity:['sweep','touch','none','unknown'],
    zone:['fvg','order_block','ote','breaker','none','unknown'],
    confirmation:['m5_engulfing','m1_structure','bos_choch','rejection','none','unknown']
  });
  const LABEL=Object.freeze({
    good:'Gutes Setup',avoid:'Kein gutes Setup',missed:'Verpasst',
    buy:'BUY',sell:'SELL',watch:'Beobachten',
    asia:'Asia',london:'London',new_york:'New York',zvieri:'Zvieri',other:'Andere',
    m1:'M1',m5:'M5',m15:'M15',h1:'H1',h4:'H4',d1:'Daily',
    sweep:'Liquidity Sweep',touch:'Liquidity Touch',none:'Nicht vorhanden',
    unknown:'Nicht bestätigt',fvg:'FVG',order_block:'Order Block',
    ote:'OTE / Fibonacci',breaker:'Breaker',m5_engulfing:'M5 Engulfing',
    m1_structure:'M1 Strukturwechsel',bos_choch:'BOS / CHOCH',
    rejection:'Klare Rejection'
  });
  const fields=['side','session','timeframe','liquidity','zone','confirmation'];
  const valid=(field,value)=>ENUMS[field]?.includes(value)===true;
  const name=value=>LABEL[value]||value||'—';
  function normalize(raw){
    if(!raw||typeof raw!=='object'||!valid('label',raw.label))return null;
    if(fields.some(key=>!valid(key,raw[key])))return null;
    const result=raw.resultR==null||raw.resultR===''?null:Number(raw.resultR);
    if(result!==null&&(!Number.isFinite(result)||result < -20||result > 100))return null;
    return {
      id:typeof raw.id==='string'?raw.id:'',
      label:raw.label,side:raw.side,session:raw.session,timeframe:raw.timeframe,
      liquidity:raw.liquidity,zone:raw.zone,confirmation:raw.confirmation,
      resultR:result,
      note:typeof raw.note==='string'?raw.note.trim().slice(0,800):'',
      createdAt:typeof raw.createdAt==='string'?raw.createdAt:''
    };
  }
  function similarity(a,b){
    let points=0,possible=0;
    const weights={side:1,session:2,timeframe:1,liquidity:3,zone:3,confirmation:3};
    for(const f of fields){
      if(['none','unknown'].includes(a[f])||['none','unknown'].includes(b[f]))continue;
      possible+=weights[f];
      if(a[f]===b[f])points+=weights[f];
    }
    return possible?points/possible:0;
  }
  function examplesFor(candidate,reviews){
    return (Array.isArray(reviews)?reviews:[]).map(normalize).filter(Boolean)
      .filter(x=>x.label!=='missed')
      .map(x=>({...x,match:similarity(candidate,x)}))
      .filter(x=>x.match>=.62)
      .sort((a,b)=>b.match-a.match)
      .slice(0,24);
  }
  function reviewAnalysis(reviews){
    const data=(Array.isArray(reviews)?reviews:[]).map(normalize).filter(Boolean);
    const labels={good:0,avoid:0,missed:0};
    data.forEach(v=>{labels[v.label]++;});
    // Self-reported R values are NOT actual broker executions.
    const outcomes=data.filter(v=>v.resultR!==null);
    const groups=new Map();
    for(const row of data.filter(v=>v.label!=='missed')){
      const key=[row.session,row.liquidity,row.zone,row.confirmation].join('/');
      const g=groups.get(key)||{key,session:row.session,liquidity:row.liquidity,
        zone:row.zone,confirmation:row.confirmation,good:0,avoid:0,total:0};
      g[row.label]++;g.total++;groups.set(key,g);
    }
    const patterns=[...groups.values()].filter(g=>g.total>=3)
      .sort((a,b)=>b.total-a.total).slice(0,6);
    let outcomeNote='';
    if(outcomes.length>=5){
      const mean=outcomes.reduce((sum,x)=>sum+x.resultR,0)/outcomes.length;
      outcomeNote='Bei '+outcomes.length+' selbst eingetragenen R-Ergebnissen liegt der Durchschnitt bei '+
        mean.toFixed(2)+' R. Das ist keine verifizierte Broker-Statistik.';
    }
    return {total:data.length,labels,patterns,outcomes:outcomes.length,outcomeNote};
  }
  function evaluate(candidate,reviews){
    const c=normalize({...candidate,label:'good'});
    if(!c) return {status:'invalid',headline:'Setup unvollständig',
      reasons:['Wähle Richtung, Session, Zeitrahmen, Liquidity, Zone und Bestätigung.'],
      examples:0,evidence:'Keine Prüfung möglich.'};
    const similar=examplesFor(c,reviews);
    const good=similar.filter(x=>x.label==='good').length;
    const avoid=similar.filter(x=>x.label==='avoid').length;
    const reasons=[];
    if(c.liquidity==='unknown')reasons.push('Liquidity ist noch nicht bestätigt – erst Sweep oder Level-Reaktion prüfen.');
    if(['unknown','none'].includes(c.zone))reasons.push('Eine frische FVG-, Order-Block- oder OTE-Zone ist nicht dokumentiert.');
    if(['unknown','none'].includes(c.confirmation))reasons.push('M1-/M5-Bestätigung fehlt. Für deinen Sniper-Entry erst Reaktion und Struktur abwarten.');
    if(c.liquidity==='touch')reasons.push('Ein Touch ist noch kein bestätigter Liquidity Sweep.');
    const lacking=['unknown','none'].includes(c.confirmation)||['unknown','none'].includes(c.zone)||
      c.liquidity==='unknown';
    const evidence=similar.length?
      similar.length+' ähnliche, von dir bewertete Setups: '+good+' gut, '+avoid+' nicht gut.':
      'Noch keine vergleichbaren, von dir bewerteten Setups.';
    let status='learning',headline='Noch nicht genügend Beispiele';
    if(lacking){status='wait';headline='Bestätigung zuerst prüfen';}
    else if(similar.length<3){
      reasons.push('Deine persönliche Setup-Historie reicht für eine belastbare Mustererkennung noch nicht aus.');
    }else if(avoid>=good){
      status='caution';headline='Deine Beispiele sprechen eher für Vorsicht';
      reasons.push('Unter vergleichbaren Setups hast du mindestens ebenso viele abgelehnt wie gut bewertet.');
    }else if(good>=3&&good>=avoid*2){
      status='aligned';headline='Passt zu deinen bisher bevorzugten Setups';
      reasons.push('Deine bisherigen Bewertungen zeigen eine wiederkehrende Präferenz – nicht zwingend einen statistischen Vorteil.');
    }else{
      status='mixed';headline='Deine Erfahrungen sind gemischt';
      reasons.push('Ähnliche Konstellationen hast du unterschiedlich eingeschätzt. Prüfe, was bei den guten Beispielen anders war.');
    }
    if(c.label==='missed')reasons.push('Ein verpasstes Setup ist kein bestätigter Gewinn und zählt nicht als Treffer.');
    reasons.push('Ohne aktuelle Kerzen, Einstiegszone und geplanten SL ist dies keine Live-Handelsempfehlung.');
    return {status,headline,reasons,examples:similar.length,good,avoid,evidence,
      basis:'Deine manuell bewerteten Setups, kein automatisches ML-Modell.'};
  }
  function coachThoughts(reviews){
    const a=reviewAnalysis(reviews);
    if(!a.total)return 'Ich kenne deine bevorzugten Setups noch nicht aus bestätigten Beispielen. '+
      'Markiere bitte ein echtes Setup als gut oder nicht gut und sage mir, warum. '+
      'Dann kann ich Vergleiche machen, statt dir allgemeine Signale zu geben.';
    const messages=['Dein Trading-Playbook enthält '+a.total+' selbst bewertete Beispiele: '+
      a.labels.good+' gut, '+a.labels.avoid+' abgelehnt und '+a.labels.missed+' verpasst.'];
    if(a.labels.good+a.labels.avoid<3)messages.push('Für Muster fehlen noch mindestens drei vergleichbare Bewertungen. '+
      'Sammle vor allem Beispiele, die sich ähneln, aber unterschiedlich ausgegangen sind.');
    const best=a.patterns[0];
    if(best){
      messages.push('Dein häufigstes dokumentiertes Muster: '+name(best.session)+', '+
        name(best.liquidity)+', '+name(best.zone)+', '+name(best.confirmation)+
        '. Du hast es '+best.good+' Mal gut und '+best.avoid+' Mal nicht gut bewertet.');
      if(best.good&&best.avoid)messages.push('Meine Gegenfrage: Welche Reaktion oder welcher Kontext '+
        'unterscheidet bei genau diesem Muster deine guten von den schlechten Setups?');
      else messages.push('Eine Gegenprobe mit bewusst abgelehnten Setups wäre hilfreich, '+
        'damit ich nicht nur bestätige, was du ohnehin magst.');
    }
    if(a.outcomeNote)messages.push(a.outcomeNote);
    messages.push('Mein Vorschlag: Vergleiche vor dem Entry die Liquidity, eine frische Zone, '+
      'M1/M5-Struktur und den geplanten Stop. Danach dokumentierst du, was tatsächlich passiert ist. '+
      'Ich ändere keine deiner Regeln automatisch.');
    return messages.join(' ');
  }
  function isCoachingQuestion(q){
    const text=String(q||'').toLocaleLowerCase('de');
    return /(?:mein(?:en|e|em)?\s+(?:trading|setup|stil|fehler)|besser\s+(?:traden|werden)|was\s+soll\s+ich.{0,65}verbessern|was\s+mach\s+ich.{0,40}falsch|wie\s+kann\s+ich.{0,50}besser\s+trad\w*|analysier\w*\s+mein\w*\s+trading|coaching|coach|playbook|welche\s+setups?\s+(?:mag|passen)|lerne?\s+(?:aus|von)\s+meinen\s+setups?)/iu.test(text);
  }
  function isLearningCommand(q){
    return /(?:setup\s+(?:bewerten|speichern|markieren)|(?:gutes?|schlechtes?)\s+setup\s+(?:speichern|merken)|aus\s+(?:diesem|meinem)\s+setup\s+lernen|setup[\s-]journal)/iu.test(String(q||''));
  }
  return Object.freeze({ENUMS,name,normalize,reviewAnalysis,evaluate,coachThoughts,isCoachingQuestion,isLearningCommand});
});
