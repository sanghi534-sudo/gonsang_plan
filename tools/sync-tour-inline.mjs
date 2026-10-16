// 관광 TOP 10·릴스 소스 변경 후 실행: node tools/sync-tour-inline.mjs
// 추천 목록과 릴스 UI는 trip-conditions.html 단독으로 열어도 표시되도록 인라인으로 포함한다.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'trip-conditions.html');let html=await readFile(target,'utf8');
for(const [file,id] of [['tour-catalog.js','tour-top10-data'],['tour-recommendations.js','tour-top10-ui'],['tour-reels.js','tour-reels-ui']]){
  const source=(await readFile(path.join(root,file),'utf8')).replace(/<\/script/gi,'<\\/script');
  const block=`<!-- ${id} START: source ${file}; sync with tools/sync-tour-inline.mjs -->\n<script id="${id}">\n${source}\n</script>\n<!-- ${id} END -->`;
  const old=new RegExp(`<!-- ${id} START[\\s\\S]*?<!-- ${id} END -->`);
  if(old.test(html))html=html.replace(old,()=>block);
  else{const tag=`<script src="${file}"></script>`;if(!html.includes(tag))throw Error('Missing inline insertion point: '+id);html=html.replace(tag,()=>block);}
}
await writeFile(target,html);console.log('Embedded tourism catalog, TOP 10 and reels UI in trip-conditions.html');
