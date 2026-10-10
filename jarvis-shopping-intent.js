/* Deterministic spoken shopping intent. Never treats general questions as writes.
   This parser runs ONLY after the user has tapped Jarvis microphone or submitted text.
   The same module is tested in Node and used on the DG OS Jarvis screen. */
(function(root,factory){
  const parser=factory();
  if(typeof module==='object' && module.exports)module.exports=parser;
  else root.DGShoppingIntent=parser;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const goods=[
    'toastbrot','toast','tomaten','tomate','käse','kaese','milch','eier','ei','brot','butter',
    'joghurt','yoghurt','quark','frischkäse','mozarella','mozzarella','parmesan','schinken',
    'salami','hähnchen','poulet','fleisch','fisch','lachs','reis','nudeln','pasta','mehl',
    'zucker','salz','pfeffer','öl','olivenöl','honig','kaffee','tee','wasser','saft','orangensaft',
    'cola','bananen','banane','äpfel','apfel','orangen','orange','erdbeeren','trauben',
    'kartoffeln','kartoffel','zwiebeln','zwiebel','knoblauch','gurken','gurke','salat',
    'paprika','peperoni','karotten','karotte','brokkoli','spinat','avocado','avocados',
    'eis','schokolade','chips','müsli','haferflocken','cornflakes','nüsse','mandeln',
    'einen liter milch','ein liter milch','rote zwiebeln','grüne paprika','rote paprika',
    'toast brot','frische tomaten','geriebener käse','scheibenkäse',
    'toilettenpapier','küchenpapier','taschentücher','zahnpasta','seife','duschgel',
    'shampoo','waschmittel','spülmittel','abfallsäcke','batterien'
  ];
  const norm=s=>String(s||'').toLocaleLowerCase('de').normalize('NFKC').replace(/\s+/g,' ').trim();
  const known=[...new Set(goods)].sort((a,b)=>b.split(' ').length-a.split(' ').length||b.length-a.length);
  const knownTokens=new Map(known.map(x=>[norm(x),x]));
  const forbidden=/\b(?:nicht|nichts|keine|keinen|kein|ohne|weniger|stornieren|löschen|entfernen|abbrechen)\b/i;
  const question=/^(?:was|wie|warum|wann|wo|wieviel|welche|welcher)\b/i;
  const capture=/^(?:(?:ich|wir)\s+)?(?:brauche|benötige|benoetige|brauch|kauf(?:e)?|hol(?:e)?|besorg(?:e)?|notier(?:e)?|schreib(?:e)?|pack(?:e)?|füg(?:e)?|fueg(?:e)?|setz(?:e)?|möchte|moechte|will)\s+(.+)$/i;
  function tryKnownWords(text){
    const words=norm(text).split(' ').filter(Boolean);
    const result=[];
    for(let i=0;i<words.length;){
      let match=null, used=0;
      for(const key of knownTokens.keys()){
        const parts=key.split(' ');
        if(parts.length>words.length-i)continue;
        if(parts.every((v,j)=>v===words[i+j])){match=text && parts.join(' ');used=parts.length;break;}
      }
      if(!match)return null;
      result.push(match);
      i+=used;
    }
    return result;
  }
  function title(v){
    const raw=String(v).trim().replace(/[.!?]+$/,'').trim();
    if(!raw||raw.length>65||!/[a-zäöü]/i.test(raw)||/[<>[\]{}]/.test(raw))return '';
    return raw[0].toLocaleUpperCase('de')+raw.slice(1);
  }
  function splitItems(raw,explicit){
    const text=raw.trim().replace(/^(?:(?:mir\s+)?(?:bitte|noch|mal|doch|einfach|auch|gerne)\s+)+/i,'')
      .replace(/\s+(?:auf|in|zu)\s+(?:die|der|meine|meiner)\s+(?:einkaufs?liste|liste)\s*[.!?]*$/i,'')
      .replace(/^(?:auf\s+die\s+)?einkaufsliste\s*[:\s]+/i,'')
      .replace(/[.!?]+\s*$/,'').trim();
    if(!text||forbidden.test(text)||/\boder\b/i.test(text)||/\b(?:irgendwas|irgendetwas|sachen|dinge|zeug|vielleicht|unklar|ungenaues)\b/i.test(text))return null;
    let parts=text.split(/\s*[,;\n]+\s*|\s+\bund\b\s+/i).filter(Boolean);
    if(parts.length===1){
      const knownParts=tryKnownWords(parts[0]);
      if(knownParts)parts=knownParts;
      else if(!explicit)return null; // Do not mistake "I need help" for food.
      else if(parts[0].split(/\s+/).length>5)return null; // unclear list, request clarification.
    }
    else {
      // "Toast Tomaten und Käse" -> split known words in each segment.
      parts=parts.flatMap(part=>tryKnownWords(part)||[part]);
    }
    if(!parts.length||parts.length>12)return null;
    const results=[];
    const seen=new Set();
    for(const part of parts){
      let cleaned=part.replace(/^(?:(?:ein|eine|einen|einem|etwas|paar|mehr|noch|bitte|mir|und)\s+)+/i,'').trim();
      if(!cleaned||cleaned.split(/\s+/).length>6)return null;
      // Unknown items only with an explicit list instruction and delimiters.
      if(!explicit&&!knownTokens.has(norm(cleaned)))return null;
      cleaned=title(cleaned);
      if(!cleaned)return null;
      const key=norm(cleaned);
      if(!seen.has(key)){results.push(cleaned);seen.add(key);}
    }
    return results.length?results:null;
  }
  function parse(raw){
    if(typeof raw!=='string'||!raw.trim()||raw.length>350)return null;
    let text=raw.trim()
      .replace(/^(?:(?:hey|hallo|hi|okay|ok)\s+)*(?:(?:jarvis)[\s,:-]*)?/i,'')
      .replace(/^(?:(?:hey|hallo|hi)\s+)+/i,'')
      .replace(/^(?:(?:bitte|ähm|also)\s+)+/i,'')
      .replace(/^(?:kannst du|könntest du|kannst du mir|mach mir)\s+(?:bitte\s+)?/i,'')
      .trim();
    if(!text||question.test(norm(text))||forbidden.test(text))return null;
    // Dated "I must buy" is a scheduled task, never silently an immediate cart addition.
    if(/\b(?:muss|müsste|muess|müssen|erinner(?:e|n)?|erinnere\s+mich)\b|\b(?:morgen|übermorgen|nächste\s+woche|naechste\s+woche|kommende\s+woche)\b/i.test(text))
      return null;
    if(/^(?:zeig|zeige|öffne|oeffne|öffnen|was steht|lies|zeige mir|was ist)\b/i.test(text))return null;
    const hasList=/\beinkaufs?liste\b|\bshoppingliste\b|\bauf\s+die\s+liste\b/i.test(text);
    let content='',explicit=false;
    const prefix=text.match(/^(?:(?:füg|fueg|schreib|setz|pack|trag|notier)\w*\s+)?(?:mir\s+)?(?:bitte\s+)?(?:in|auf|für|zu)\s+(?:die|der|meine|meiner)\s+(?:einkaufs?liste|shoppingliste|liste)\s*[:,-]?\s+(.+)$/i);
    const direct=text.match(/^(?:die\s+)?(?:einkaufs?liste|shoppingliste)\s*[:,-]\s*(.+)$/i);
    if(prefix||direct){
      content=(prefix||direct)[1].trim();explicit=true;
    }else{
      const initial=text.match(capture);
      if(initial){
        content=initial[1].trim();explicit=hasList;
      }else if(hasList){
        content=text.replace(/^(?:bitte\s+)?(?:(?:füg|fueg|schreib|setz|pack|trag|notier)\w*\s+)?/i,'').trim();
        explicit=true;
      }else return null;
    }
    content=content
      .replace(/^(?:mir\s+)?(?:bitte\s+)?(?:auf|in|zu)\s+(?:die|meine)\s+(?:einkaufs?liste|liste)\s*[:,-]?\s*/i,'')
      .replace(/\s+(?:in|auf|zur|zu)\s+(?:die|der|meine|meiner)?\s*(?:einkaufs?liste|shoppingliste|liste)(?:\s+(?:setzen|schreiben|eintragen|packen|hinzufügen|hinzufuegen))?\.?$/i,'')
      .replace(/\s+(?:für|fuer)\s+(?:den|die)\s+einkauf\s*$/i,'')
      .trim();
    if(/^(?:mich|uns)\b/i.test(content))return null;
    if(/\b(?:bezahlen|überweisen|rechnungen|rechnung|termin|erledigen)\b/i.test(content))return null;
    const items=splitItems(content,explicit);
    if(items)return {intent:'shopping_add',items};
    if(explicit)return {intent:'shopping_clarify',items:[]};
    return null;
  }
  return {parseShoppingCommand:parse};
});