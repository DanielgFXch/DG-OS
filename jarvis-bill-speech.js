/* DG OS · Natural spoken bill capture, no guessed payment/due date.
 * Parser is deterministic and testable. Every result opens a confirmable
 * draft; simply speaking can NEVER store or pay a bill.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGOSInvoiceSpeech=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const months={januar:1,februar:2,märz:3,maerz:3,april:4,mai:5,juni:6,
    juli:7,august:8,september:9,oktober:10,november:11,dezember:12};
  function validDate(y,m,d){
    const dt=new Date(Date.UTC(y,m-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()+1===m&&dt.getUTCDate()===d
      ? [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-'):'';
  }
  function dateFromText(raw){
    const m=raw.match(/\b([0-3]?\d)[.\/-]([01]?\d)[.\/-](20\d{2})\b/);
    if(m)return validDate(Number(m[3]),Number(m[2]),Number(m[1]));
    const written=raw.match(/\b([0-3]?\d)\.?\s+(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(20\d{2})\b/i);
    if(written)return validDate(Number(written[3]),months[written[2].toLocaleLowerCase('de')],Number(written[1]));
    return '';
  }
  function extractAmount(raw){
    const n='(\\d{1,6}(?:[.,]\\d{1,2})?)';
    const a=new RegExp('\\b(?:CHF|Franken|Fr\\.)\\s*'+n,'i').exec(raw);
    const b=new RegExp(n+'\\s*(?:CHF|Franken|Fr\\.)\\b','i').exec(raw);
    const m=a||b;
    if(!m)return '';
    const value=Number(m[1].replace(',','.'));
    return value>0&&value<=999999?value.toFixed(2):'';
  }
  function normalizeTitle(raw){
    const match=/(?:rechnung|mahnung)\s+(?:von|für|fuer|bei|der|des)\s+(.+?)(?=\s+(?:über|ueber|in höhe|für|fuer|mit|von|fällig|faellig|bis|am|zum|bezahlen|zahlen|ich|beträgt|betrag|chf|franken)\b|[,.!?]|$)/i.exec(raw);
    const alternate=/(?:von|bei)\s+(.+?)\s+(?:eine\s+)?(?:rechnung|mahnung)\b/i.exec(raw);
    let name=(match?.[1]||alternate?.[1]||'').trim().replace(/[^\p{L}\p{N} &+\-]/gu,' ').replace(/\s+/g,' ').slice(0,60);
    if(!name)return 'Rechnung prüfen';
    name=name.replace(/^(?:dem|der|den)\s+/i,'');
    return 'Rechnung '+name;
  }
  function parse(raw){
    if(typeof raw!=='string'||raw.trim().length<9||raw.length>600)return null;
    const s=raw.trim().replace(/^(?:(?:hey|hallo|ok)\s*,?\s*)?jarvis\s*,?\s*/i,'');
    if(!/\b(?:rechnung|rechnungen|mahnung|mahnungen)\b/i.test(s))return null;
    if(/\b(?:keine|keinen|kein|nicht|stornieren|lösche|loesche|löschen|loeschen)\s+(?:offene\s+)?(?:rechnung|rechnungen|mahnung|mahnungen)\b/i.test(s))return null;
    if(/^(?:was|welche|wieviele|wie\s+viele|zeig|zeige|öffne|oeffne|liste|habe ich offene|sind noch)\b/i.test(s)&&
       /\b(?:rechnungen|mahnungen|offene\s+rechnung|offene\s+mahnung|zahlen|bezahlen)\b/i.test(s)&&
       !/^(?:was ist|was bedeutet|wie funktioniert)\b/i.test(s))return {intent:'bill_list'};
    if(/\?$/.test(s)&&!/\b(?:eintragen|speichern|notieren|erfassen)\b/i.test(s))return null;
    // Only an affirmative statement or explicit request to log an invoice.
    if(!/\b(?:ich\s+(?:habe|hab|bekam|bekommen|muss)|wir\s+(?:haben|müssen)|(?:bitte\s+)?(?:speichere|notiere|erfasse|trag\s+ein|trage\s+ein)|meine|eine|die)\b/i.test(s))return null;
    const amount=extractAmount(s);
    const dueDate=dateFromText(s) ||
      (windowFallbackDueDate(s)||'');
    return {intent:'bill_draft',title:normalizeTitle(s),amount,currency:'CHF',
      dueDate,description:'Gesprochen · vor dem Speichern überprüfen'};
  }
  function windowFallbackDueDate(raw){
    if(typeof globalThis==='undefined')return '';
    const parsed=globalThis.DGOSLifeIntent?.dueDate?.(raw);
    return parsed?.date||'';
  }
  return {parse,dateFromText,extractAmount,normalizeTitle,validDate};
});
