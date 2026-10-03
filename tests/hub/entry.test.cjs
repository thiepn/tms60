const assert=require('node:assert/strict');const {parse}=require('../../hub-entry.js');
assert.deepEqual(parse('#hub=niv%3A60%3Areference'),{translation:'niv',verseId:60,dimension:'reference'});
for(const value of ['#hub=esv:61:wording','#hub=esv:0:wording','#hub=bad:1:learning','#hub=ESV:1:wording','#hub=esv:1:reset','#hub=esv:1:wording&token=x','#hub=esv%253A1%253Awording'])assert.equal(parse(value),null);
console.log('H15 exact translation-qualified entry parser passed.');
