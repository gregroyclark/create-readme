const $ = id => document.getElementById(id);
const fragment = location.hash.slice(1);
const token = /^[a-f0-9]{48}$/.test(fragment) ? fragment : sessionStorage.getItem('studio-token') || '';
if (token) sessionStorage.setItem('studio-token', token);
const clone = value => JSON.parse(JSON.stringify(value));
let snapshot, overrides = {}, savedOverrides = {}, reviewed = null;
let revision = 0, timer, busy = false, previewView = 'rendered';
let lastOutcome = 'No files changed this session';
const names = {'project-structure':'Project structure', installation:'Installation', usage:'Usage', commands:'Commands', architecture:'Architecture', testing:'Testing', deployment:'Deployment', technology:'Technology', license:'License', features:'Features', demo:'Demo', contributing:'Contributing', author:'Author'};
const styleDescriptions = {flat:'Flat: compact badge with softly rounded corners.', 'flat-square':'Flat square: compact badge with square corners.', 'for-the-badge':'For the badge: larger, uppercase treatment.', plastic:'Plastic: rounded badge with a glossy treatment.', social:'Social: compact label and separate count treatment.'};
const isDirty = () => JSON.stringify(overrides) !== JSON.stringify(savedOverrides);
const has = key => Object.hasOwn(overrides, key);
const value = key => has(key) ? overrides[key] : snapshot?.defaults[key];
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function button(text, action, className = 'text-button') { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node; }
function showError(error) { $('error').textContent = error.message || String(error); $('error').hidden = false; }
function notice(text) { $('notice').textContent = text; $('notice').hidden = false; }
function dirtyStatus() { $('dirty-state').textContent = `${isDirty() ? 'Unsaved choices' : 'Choices match loaded config'} · ${lastOutcome}`; }
function updateSaveButtons() {
  $('save-config').disabled = !reviewed || busy || !$('confirm-config').checked;
  $('write-readme').disabled = !reviewed || busy || !$('confirm-readme').checked || reviewed.errors.length > 0;
}
function invalidateReview() { reviewed = null; $('review-content').hidden = true; $('confirm-readme').checked = false; $('confirm-config').checked = false; $('review-state').textContent = 'Draft changed. Refresh review before saving.'; updateSaveButtons(); }
function changed() { revision++; invalidateReview(); dirtyStatus(); $('status').textContent = 'Preview updating…'; clearTimeout(timer); timer = setTimeout(() => refreshPreview(false), 350); }
function change(key, next) { overrides[key] = next; changed(); updateOrigins(); }
function reset(key) { delete overrides[key]; changed(); renderEditor(); }
async function api(route, body) {
  const response = await fetch(route, { method: body === undefined ? 'GET' : 'POST', headers:{Authorization:`Bearer ${token}`, ...(body === undefined ? {} : {'Content-Type':'application/json'})}, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = {error:text}; }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function wireTabs(group, onSelect) {
  for (const name of group) {
    $(`${name}-tab`).addEventListener('click', () => { for (const id of group) { $(`${id}-tab`).setAttribute('aria-selected', String(id === name)); $(`${id}-tab`).tabIndex = id === name ? 0 : -1; $(id).hidden = id !== name; } onSelect?.(name); });
    $(`${name}-tab`).addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); const index = group.indexOf(name);
      const next = event.key === 'Home' ? group[0] : event.key === 'End' ? group.at(-1) : group[(index + (event.key === 'ArrowLeft' ? -1 : 1) + group.length) % group.length];
      $(`${next}-tab`).click(); $(`${next}-tab`).focus();
    });
  }
}
wireTabs(['compose','evidence','review']); wireTabs(['rendered','markdown'], name => { previewView = name; });
function field(parent, key, label, {multiline = false, read, write, hint, lines = false} = {}) {
  const wrap = el('div', undefined, 'field'), top = el('div', undefined, 'field-heading');
  const lab = el('label', label, 'field-label'); lab.htmlFor = `field-${key}`;
  const origin = el('span', '', 'origin'); origin.dataset.origin = key; top.append(lab, origin);
  const input = document.createElement(multiline ? 'textarea' : 'input'); input.id = `field-${key}`;
  if (!multiline) input.type = 'text'; else input.rows = key === 'description' ? 3 : 4;
  const current = value(key); input.value = read ? read(current) : lines ? (current || []).join('\n') : current ?? '';
  input.addEventListener('input', () => change(key, write ? write(input.value) : lines ? input.value.split('\n').map(x=>x.trim()).filter(Boolean) : input.value));
  wrap.append(top, input); if (hint) wrap.append(el('p', hint, 'hint'));
  const resetButton = button('Use detected value', () => reset(key)); resetButton.dataset.reset = key; wrap.append(resetButton); parent.append(wrap);
}
function rowsEditor(parent, key, title, columns, {read, write, single = false} = {}) {
  const wrap = el('fieldset', undefined, 'collection'); wrap.append(el('legend',title));
  const origin = el('span', '', 'origin'); origin.dataset.origin = key; wrap.append(origin);
  const rows = clone(read ? read(value(key)) : value(key) || []);
  if (!rows.length) wrap.append(el('p','No rows detected. Add only what you know.','hint'));
  rows.forEach((row,index) => {
    const line = el('div', undefined, 'collection-row');
    for (const [property,label] of columns) {
      const lab = el('label', `${label} ${index+1}`, 'hint');
      const input = document.createElement('input'); input.type = 'text'; input.value = row[property] || ''; input.setAttribute('aria-label',`${title} ${label} ${index+1}`);
      input.addEventListener('input', () => { rows[index][property] = input.value; change(key,write ? write(rows) : rows); }); lab.append(input); line.append(lab);
    }
    line.append(button(`Remove row ${index+1}`, () => { rows.splice(index,1); change(key,write ? write(rows) : rows); renderEditor(); })); wrap.append(line);
  });
  if(!single || !rows.length)wrap.append(button(`Add ${title.toLowerCase()} row`, () => { rows.push(Object.fromEntries(columns.map(([k])=>[k,'']))); change(key,write ? write(rows) : rows); renderEditor(); }));
  wrap.append(button('Use detected rows', () => reset(key))); parent.append(wrap);
}
function updateOrigins() {
  for (const origin of document.querySelectorAll('[data-origin]')) { origin.textContent = has(origin.dataset.origin) ? 'Override' : 'Detected / default'; origin.classList.toggle('overridden',has(origin.dataset.origin)); }
  for (const resetButton of document.querySelectorAll('[data-reset]')) resetButton.hidden = !has(resetButton.dataset.reset);
  $('section-origin').textContent = has('sections') ? 'Override' : 'Detected';
}
function renderEditor() {
  if (!snapshot) return;
  const overview = $('overview-fields'); overview.replaceChildren(); field(overview,'title','Project title'); field(overview,'description','Short description',{multiline:true});
  const content = $('content-fields'); content.replaceChildren();
  field(content,'features','Features',{multiline:true,lines:true,hint:'One feature per line.'});
  field(content,'installCommand','Installation command',{multiline:true}); field(content,'usageCommand','Usage command',{multiline:true});
  field(content,'architecture','Architecture',{multiline:true,read:x=>typeof x === 'string' ? x : x?.summary || '',write:summary=>({summary,evidence:[]}),hint:'Your edits are intentional prose, not detected evidence.'});
  rowsEditor(content,'commands','Commands',[['id','Name'],['command','Command'],['description','Description']]);
  rowsEditor(content,'projectStructure','Project structure',[['path','Path'],['description','Purpose']]);
  rowsEditor(content,'testing','Testing',[['id','Name'],['command','Command'],['description','Description']],{read:x=>x?.commands||[],write:commands=>({commands})});
  rowsEditor(content,'deployment','Deployment',[['provider','Provider'],['configFile','Config file'],['publishDirectory','Publish directory']],{read:x=>x?[x]:[],write:rows=>rows[0]||null,single:true});
  rowsEditor(content,'technologies','Technologies',[['name','Name'],['category','Category']],{read:x=>(x||[]).map(item=>typeof item==='string'?{name:item,category:''}:item),write:rows=>rows.map(item=>item.category?item:item.name)});
  field(content,'languages','Languages',{multiline:true,lines:true}); field(content,'license','License identifier',{hint:'Leave unknown licenses blank. This never creates license text.'});
  field(content,'demoPath','Demo image path'); field(content,'contributingFile','Contributing guide path'); field(content,'author','Author');
  renderSections(); renderBadges(); updateOrigins();
}
function renderSections() {
  const enabled = has('sections') ? overrides.sections : snapshot.model.sections, order = [...enabled, ...snapshot.sectionIds.filter(id=>!enabled.includes(id))];
  $('sections').replaceChildren(...order.map(id=>{
    const li = el('li'), label = el('label'), checkbox = document.createElement('input'); checkbox.type='checkbox'; checkbox.checked=enabled.includes(id); checkbox.setAttribute('aria-label',`Include ${names[id]||id}`);
    checkbox.addEventListener('change',()=>{ change('sections',checkbox.checked ? [...enabled,id] : enabled.filter(x=>x!==id)); renderSections(); }); label.append(checkbox,el('span',names[id]||id)); li.append(label);
    if(enabled.includes(id)) {
      const index=enabled.indexOf(id), move=delta=>{const next=[...enabled];[next[index],next[index+delta]]=[next[index+delta],next[index]];change('sections',next);renderSections();document.querySelector(`[data-section="${id}"]`)?.focus();};
      const up=button('Up',()=>move(-1));up.setAttribute('aria-label',`Move ${names[id]||id} up`);up.disabled=index===0;up.dataset.section=id;
      const down=button('Down',()=>move(1));down.setAttribute('aria-label',`Move ${names[id]||id} down`);down.disabled=index===enabled.length-1;li.append(up,down);
    } return li;
  }));
}
function renderBadges() {
  const ids = has('badges') ? overrides.badges : snapshot.model.badgeIds;
  $('badges').replaceChildren(...snapshot.badgeCandidates.map(item=>{
    const label=el('label',undefined,'badge-choice'), input=document.createElement('input');input.type='checkbox';input.checked=ids.includes(item.id);input.setAttribute('aria-label',item.label);
    input.addEventListener('change',()=>{const selected = has('badges') ? overrides.badges : snapshot.model.badgeIds;change('badges',input.checked?[...selected,item.id]:selected.filter(id=>id!==item.id));});label.append(input,el('span',item.label));return label;
  }));
  if(!snapshot.badgeCandidates.length)$('badges').append(el('p','No badge candidates detected.','hint'));
  $('badge-style').replaceChildren(...snapshot.badgeStyles.map(style=>{const option=el('option',style);option.value=style;return option;}));$('badge-style').value=value('badgeStyle') || 'flat-square';$('style-description').textContent=styleDescriptions[$('badge-style').value];
}
function present(data) {
  snapshot=data;$('repository').textContent=data.repository;
  // Only server-rendered Markdown with raw HTML disabled is inserted as HTML.
  $('rendered').innerHTML=data.html;$('source').textContent=data.markdown;
  $('rendered').hidden=previewView!=='rendered';$('markdown').hidden=previewView!=='markdown';$('loading').hidden=true;
  const messages=[...data.errors.map(x=>`Error: ${x}`),...data.warnings.map(x=>`Warning: ${x}`)];$('messages').replaceChildren(...messages.map(x=>el('li',x)));$('diagnostics').hidden=!messages.length;$('diagnostics').open=!!data.errors.length;$('diagnostic-summary').textContent=`${messages.length} review notes`;
  $('status').textContent=`${data.errors.length?'Needs attention':'Preview ready'} · ${data.errors.length} errors · ${data.warnings.length} warnings`;$('preview-caption').textContent='Generated from repository facts and your choices';
  $('scan-summary').textContent=`${data.facts.length} facts shown · ${data.filesScanned} files scanned`;$('facts').replaceChildren(...data.facts.map(f=>{const row=el('div');row.append(el('dt',f.label),el('dd',f.value),el('dd',f.source,'evidence'));return row;}));
  $('overrides-list').replaceChildren(...Object.keys(overrides).map(key=>el('li',key)));if(!Object.keys(overrides).length)$('overrides-list').append(el('li','No overrides. All values follow repository detection.'));
  const evidence=data.model.architecture?.evidence || [];$('architecture-origin').textContent=has('architecture')?'Intentional override; inspect supplied evidence below.':'Repository inference. No architecture is added without supporting signals.';$('architecture-evidence').replaceChildren(...(evidence.length?evidence:['No supporting evidence recorded.']).map(x=>el('li',typeof x==='string'?x:JSON.stringify(x))));
  $('scan-time').textContent=`Scanned ${new Date(data.scannedAt).toLocaleTimeString()}`;$('config').textContent=`Choices: ${data.targets.config.path}`;$('badge-urls').textContent=data.model.badges.map(x=>x.image).join('\n') || 'No badges selected.';dirtyStatus();renderSections();renderBadges();
}
async function refreshPreview(rebuild) {
  if(!snapshot) return false;const serial=revision;
  try { const data=await api('/api/preview',{overrides:clone(overrides)});if(serial!==revision)return false;present(data);if(rebuild)renderEditor();$('error').hidden=true;return true; }
  catch(error) {if(serial!==revision)return false;invalidateReview();showError(error);$('status').textContent='Preview unavailable';$('preview-caption').textContent='Last successful preview — current draft could not be rendered';return false;}
}
async function rescan() {
  clearTimeout(timer);revision++;invalidateReview();$('refresh').disabled=true;$('editor-fields').disabled=true;$('reset-all').disabled=true;
  try {
    if(snapshot&&isDirty()){if(await refreshPreview(true))notice('Repository rescanned. Your unsaved choices were retained.');}
    else { const data=await api('/api/studio');overrides=clone(data.overrides);savedOverrides=clone(data.overrides);present(data);renderEditor();$('error').hidden=true; }
    $('editor-fields').disabled=false;$('reset-all').disabled=false;$('review-button').disabled=false;
  }catch(error){showError(error);$('loading').textContent='Unable to open the repository. Rescan to retry.';}
  finally{$('refresh').disabled=false;if(snapshot){$('editor-fields').disabled=false;$('reset-all').disabled=false;}}
}
async function prepareReview() {
  if(busy)return;
  clearTimeout(timer);const serial=++revision;reviewed=null;updateSaveButtons();$('prepare-review').disabled=true;
  try {
    const data=await api('/api/preview',{overrides:clone(overrides)});if(serial!==revision)return;present(data);reviewed=clone(data);$('error').hidden=true;
    $('before-readme').textContent=data.targets.readme.content || (data.targets.readme.exists?'(Empty file)':'(File does not exist)');$('after-readme').textContent=data.markdown;
    $('before-config').textContent=data.targets.config.content || (data.targets.config.exists?'(Empty file)':'(File does not exist)');$('after-config').textContent=JSON.stringify(overrides,null,2)+'\n';
    $('readme-target').textContent=data.targets.readme.path;$('config-target').textContent=data.targets.config.path;
    $('readme-diff-summary').textContent=data.targets.readme.content===data.markdown?'Generated output matches the current file.':`${data.targets.readme.exists?'Replace the entire existing file':'Create a new file'}. Compare every section below.`;
    $('confirm-readme').checked=false;$('confirm-config').checked=false;$('review-content').hidden=false;$('review-state').textContent=data.errors.length?'Resolve validation errors before writing the README. Config can be saved separately.':'Review captured. Each action saves one file only.';
  }catch(error){showError(error);$('review-state').textContent='Review failed. Resolve the error and try again.';}
  finally{$('prepare-review').disabled=false;updateSaveButtons();}
}
async function save(kind) {
  if(!reviewed||busy)return;const data=reviewed,draft=clone(overrides);busy=true;$('editor-fields').disabled=true;$('refresh').disabled=true;$('reset-all').disabled=true;$('prepare-review').disabled=true;updateSaveButtons();
  try {
    const response=await api(kind==='config'?'/api/save-config':'/api/write-readme',{overrides:draft,expectedRevision:data.targets[kind==='config'?'config':'readme'].revision,confirm:true,reviewId:data.reviewId});
    if(kind==='config')savedOverrides=clone(draft);lastOutcome=`${kind==='config'?'Config saved':'README written'}: ${response.saved.path}`;notice(`${lastOutcome}. ${kind==='config'?'The README was not changed.':'Configuration was not changed.'}`);
    present(response);invalidateReview();$('review-state').textContent='Saved. Refresh review before another write.';$('error').hidden=true;
    if(response.warning)notice(`${lastOutcome}. ${response.warning}`);
  }catch(error){showError(error);invalidateReview();$('review-state').textContent='Save refused or failed. Your draft is retained. Refresh review to compare current files before trying again.';}
  finally{busy=false;$('editor-fields').disabled=false;$('refresh').disabled=false;$('reset-all').disabled=false;$('prepare-review').disabled=false;updateSaveButtons();dirtyStatus();}
}
$('editor').addEventListener('submit',event=>event.preventDefault());$('badge-style').addEventListener('change',()=>{change('badgeStyle',$('badge-style').value);$('style-description').textContent=styleDescriptions[$('badge-style').value];});
$('reset-sections').addEventListener('click',()=>reset('sections'));$('reset-badges').addEventListener('click',()=>{delete overrides.badges;delete overrides.badgeStyle;changed();renderBadges();});$('refresh').addEventListener('click',rescan);
$('reset-all').addEventListener('click',()=>{if(!window.confirm('Reset all draft choices to repository detection? Files will not change.'))return;overrides={};changed();renderEditor();});
$('prepare-review').addEventListener('click',prepareReview);$('review-button').addEventListener('click',()=>{$('review-tab').click();prepareReview();$('review').scrollIntoView({block:'start'});});
for(const kind of ['config','readme'])$(`confirm-${kind}`).addEventListener('change',updateSaveButtons);
$('save-config').addEventListener('click',()=>save('config'));$('write-readme').addEventListener('click',()=>save('readme'));
window.addEventListener('beforeunload',event=>{if(isDirty()){event.preventDefault();event.returnValue='';}});rescan();
