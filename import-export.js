(() => {
  // Clean previous instances
  document.getElementById('routine-copy-panel')?.remove();
  document.getElementById('routine-copy-panel-style')?.remove();

  /* -----------------------------  Styles  ----------------------------- */
  const style = document.createElement('style');
  style.id = 'routine-copy-panel-style';
  style.textContent = `
    #routine-copy-panel{position:fixed;bottom:20px;right:20px;z-index:99999;background:#181a1b;color:#fff;font-family:sans-serif;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.4);display:flex;flex-direction:column;align-items:stretch;max-width:280px}
    #routine-copy-panel button{cursor:pointer;background:#1780ea;color:#fff;border:none;padding:8px 12px;border-radius:4px;font-size:14px;transition:transform .15s ease;margin-top:8px}
    #routine-copy-panel button:first-child{margin-top:0}
    #routine-import-box{display:none;margin-top:8px;width:100%;height:120px;background:#0d0e0f;border:1px solid #444;color:#fff;border-radius:4px;padding:6px 8px;font-family:monospace;font-size:12px;resize:vertical}
    @keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
    .pulse{animation:pulse .3s ease-out}`;
  document.head.appendChild(style);

  /* -----------------------------  Panel  ------------------------------ */
  const panel       = Object.assign(document.createElement('div'), { id: 'routine-copy-panel' });
  const btnRoutine   = document.createElement('button');
  const btnExercises = document.createElement('button');
  const btnImport    = document.createElement('button');
  const importBox    = Object.assign(document.createElement('textarea'), { id:'routine-import-box', placeholder:'Paste routine JSON here & click "Import Routine" again' });
  btnRoutine.textContent   = 'Copy Routine';
  btnExercises.textContent = 'Copy Exercises';
  btnImport.textContent    = 'Import Routine';
  panel.append(btnRoutine, btnExercises, btnImport, importBox);
  document.body.appendChild(panel);

  /* ----------------------------  Helpers  ----------------------------- */
  const q  = (sel, el = document) => el.querySelector(sel);
  const qa = (sel, el = document) => [...el.querySelectorAll(sel)];
  const delay = ms => new Promise(res => setTimeout(res, ms));

  // True React value setter (thanks to https://stackoverflow.com/a/46012210)
  const setNativeValue = (element, value) => {
    const lastValue = element.value;
    element.value = value;
    const tracker = element._valueTracker;
    if (tracker) tracker.setValue(lastValue);
    element.dispatchEvent(new Event('input', { bubbles:true }));
  };

  const pulse = btn => { btn.classList.add('pulse'); setTimeout(() => btn.classList.remove('pulse'), 300); };

  /* -------------------------  Copy Routine  --------------------------- */
  btnRoutine.onclick = async () => {
    const title = q('input[placeholder="Workout Routine Title"]')?.value.trim() || '';
    const cards = qa('[data-rbd-draggable-id]');
    let supersetCounter = 1, currentSuperset = null;

    const exercises = cards.map(card => {
      const isSuper = !!q('[class*="Superset"], .sc-94e4f74c-0', card) || !!q('.sc-7163bf3d-1', card);
      let supersetId = null;
      if (isSuper) supersetId = currentSuperset ?? (currentSuperset = supersetCounter++); else currentSuperset = null;

      const name = q('p.cAFQFu', card)?.textContent.trim() || '';
      const note = q('textarea', card)?.value.trim() || '';
      const rest = q('.css-gfxedy-singleValue', card)?.textContent.trim() || '';

      const setsRows = qa('.sc-abc5131-2', card);
      const sets = setsRows.map((row,i) => {
        const tag = q('.sc-2f3c8150-0 p', row)?.textContent.trim() || String(i+1);
        const inputs = qa('input', row);
        const weight = inputs.length>1 ? (inputs[0]?.value||'') : '';
        const reps   = inputs.length>1 ? (inputs[1]?.value||'') : (inputs[0]?.value||'');
        return { set: tag, weight, reps };
      });
      return { name, note, rest, sets, supersetId };
    });

    navigator.clipboard.writeText(JSON.stringify({ title, exercises }, null, 2)).then(()=>pulse(btnRoutine));
  };

  /* ------------------------  Copy Exercises  -------------------------- */
  btnExercises.onclick = () => {
    const rows = qa('.sc-5cfead32-0');
    const exercises = rows.map(r=>{
      const name=q('p.sc-8f93c0b5-8',r)?.textContent.trim()||'';
      const muscle=q('p.sc-8f93c0b5-9',r)?.textContent.trim()||'';
      return name?{name,muscle}:null;
    }).filter(Boolean);
    navigator.clipboard.writeText(JSON.stringify(exercises,null,2)).then(()=>pulse(btnExercises));
  };

  /* ------------------------  Import Routine  -------------------------- */
  btnImport.onclick = async () => {
    if (importBox.style.display !== 'block') { importBox.style.display='block';importBox.focus();pulse(btnImport);return; }
    if (!importBox.value.trim()) return alert('Paste routine JSON first');
    let data; try{data=JSON.parse(importBox.value.trim());}catch{ return alert('Invalid JSON'); }
    await importRoutine(data);
    pulse(btnImport);
  };

  /* --------------------  Routine Builder Logic  ----------------------- */
  async function importRoutine(routine){
    if(!Array.isArray(routine.exercises)) return alert('JSON missing exercises array');
    const titleInput=q('input[placeholder="Workout Routine Title"]');
    if(routine.title&&titleInput) titleInput.value=routine.title;

    const supersets={};
    for(const ex of routine.exercises){ await addExercise(ex); if(ex.supersetId!=null)(supersets[ex.supersetId]??=[]).push(ex.name); }
    for(const id in supersets){ const[anchor,...others]=supersets[id]; for(const name of others) await linkSuperset(name,anchor); }
    for(const ex of routine.exercises) await applyDetails(ex);
  }

  /* ---------------------- UI Interaction Helpers ---------------------- */
  const findCard=name=>qa('[data-rbd-draggable-id]').find(c=>q('p.cAFQFu',c)?.textContent.trim()===name);

  async function addExercise(ex){ const row=qa('.sc-5cfead32-0').find(r=>q('p.sc-8f93c0b5-8',r)?.textContent.trim()===ex.name); row?.click(); await delay(500); }

  async function applyDetails(ex){
    const card=findCard(ex.name); if(!card) return;

    /* NOTES FIRST */
    if(typeof ex.note==='string') await setNote(card,ex.note);

    /* Rest */
    if(ex.rest){ const restDisp=q('.css-gfxedy-singleValue',card); if(restDisp) restDisp.textContent=ex.rest; const restInput=q('input[type="text"], input.css-1hac4vs-dummyInput',card); if(restInput){ setNativeValue(restInput,ex.rest);} }

    /* Sets */
    if(Array.isArray(ex.sets)&&ex.sets.length){ const addBtn=qa('button',card).find(b=>/Add set/i.test(b.textContent)); let rows=qa('.sc-abc5131-2',card); while(rows.length<ex.sets.length&&addBtn){ addBtn.click(); await delay(120); rows=qa('.sc-abc5131-2',card); }
      rows.forEach((row,i)=>fillSetRow(row,ex.sets[i])); }
  }

  async function setNote(card,text){
    let area=card.querySelector('textarea');
    if(!area){ const noteP=[...card.querySelectorAll('p')].find(p=>/note/i.test(p.textContent)); noteP?.click(); await delay(150); area=card.querySelector('textarea'); }
    if(!area) return;
    setNativeValue(area,text);
    // verify & retry once if still empty
    if(area.value.trim()!==text){ await delay(300); setNativeValue(area,text); }
  }

  function fillSetRow(row,data){ if(!data) return; const inputs=qa('input',row); if(inputs.length===1){ setNativeValue(inputs[0],data.reps??''); } else if(inputs.length>=2){ setNativeValue(inputs[0],data.weight??''); setNativeValue(inputs[1],data.reps??''); }}

  async function linkSuperset(name,anchor){ const card=findCard(name); if(!card) return; const opts=q('[type="options"]',card)?.parentElement||qa('svg[type="options"]',card)[0]?.parentElement; if(!opts) return; opts.click(); await delay(250); const addItem=qa('.szh-menu__item').find(i=>/Add to Superset/i.test(i.textContent)); if(!addItem) return; addItem.click(); await delay(300); const modal=q('.ReactModal__Content'); if(!modal) return; const anchorRow=qa('p',modal).find(p=>p.textContent.trim()===anchor)?.closest('[class*="sc-42fff1f3-0"]'); anchorRow?.click(); await delay(200); qa('button',modal).find(b=>/Cancel|Close/i.test(b.textContent))?.click(); }
})();
