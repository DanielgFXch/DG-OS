'use strict';

/**
 * Read-only strategy knowledge source for Jarvis.
 * Never treats a documented strategy chapter as an implemented trading rule.
 * No AI-written content is allowed to modify rules/strategy.md.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STRATEGY_PATH = path.resolve(__dirname, '../../rules/strategy.md');
const CHAPTER_COUNT = 17;

function readStrategy() {
  const content = fs.readFileSync(STRATEGY_PATH, 'utf8');
  const lines = [...content.matchAll(/^## (\d+)\. (.+)$/gm)];
  const chapters = lines.map((match, index) => {
    const start = match.index;
    const end = lines[index + 1]?.index ?? content.length;
    const body = content.slice(start, end).trim();
    const status = /\*\*Status:\*\*\s*[^\n]*DEFINIERT/i.test(body)
      ? 'DEFINED'
      : 'NOT_DEFINED';
    return Object.freeze({ number: Number(match[1]), title: match[2].trim(), status, text: body });
  });
  if (chapters.length !== CHAPTER_COUNT || chapters.some((item, i) => item.number !== i)) {
    throw new Error('STRATEGY_SOURCE_INVALID');
  }
  return Object.freeze({
    source: 'rules/strategy.md',
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    chapters: Object.freeze(chapters)
  });
}

/**
 * Returns source excerpts with citations; does not predict prices or create signals.
 * Caller must supply valid inputs; missing chapter is reported, never fabricated.
 */
function getStrategyContext(chapterNumbers) {
  const source = readStrategy();
  const numbers = [...new Set(chapterNumbers)].filter(n => Number.isInteger(n) && n >= 0 && n < CHAPTER_COUNT);
  return Object.freeze({
    source: source.source,
    sha256: source.sha256,
    chapters: numbers.map(n => source.chapters[n]),
    note: 'DEFINED means documented, not implemented. Trading decisions require separately tested DG rules and real market data.'
  });
}

module.exports = { readStrategy, getStrategyContext };
