(() => {
  // Remove any existing instance of the panel, its style or the import box so re‑pasting cleanly overwrites it
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

    /* Pulse feedback */
    @keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
    .pulse{animation:pulse .3s ease-out}
  `;
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

  /* -------------------------  Copy Routine  --------------------------- */
  btnRoutine.onclick = async () => {
    /* Title */
    const title = q('input[placeholder="Workout Routine Title"]')?.value.trim() || '';

    /* Card list */
    const cards = qa('[data-rbd-draggable-id]');

    let supersetCounter = 1;     // numeric IDs: 1,2,3...
    let currentSuperset = null;  // track contiguous superset blocks

    const exercises = cards.map(card => {
      /* Superset handling - look for purple badge within the card */
      const isSupersetCard = !!q('[class*="Superset"], .sc-94e4f74c-0', card) || !!q('.sc-7163bf3d-1', card);
      let supersetId = null;
      if (isSupersetCard) {
        if (currentSuperset === null) {
          supersetId = supersetCounter++;   // start new group
          currentSuperset = supersetId;
        } else {
          supersetId = currentSuperset;     // continue current group
        }
      } else {
        currentSuperset = null;             // reset when leaving a superset block
      }

      /* Basic fields */
      const name = q('p.cAFQFu', card)?.textContent.trim() || '';
      const note = q('textarea', card)?.value.trim() || '';
      const rest = q('.css-gfxedy-singleValue', card)?.textContent.trim() || '';

      /* -----------------------  Sets  ---------------------- */
      const setsRows = qa('.sc-abc5131-2', card);
      const sets = setsRows.map((row, idx) => {
        const tagNode = q('.sc-2f3c8150-0 p', row);
        const tag    = tagNode?.textContent.trim() || String(idx + 1);
        const inputs = qa('input', row).filter(el => el.tagName === 'INPUT');
        // for robustness read both value property and attribute
        const weightVal = inputs[0]?.value || inputs[0]?.getAttribute('value') || '';
        const repsVal   = inputs[1]?.value || inputs[1]?.getAttribute('value') || '';
        return { set: tag, weight: weightVal, reps: repsVal };
      });

      return { name, note, rest, sets, supersetId }; // supersetId null when not in superset
    });

    const routine = { title, exercises };

    navigator.clipboard
      .writeText(JSON.stringify(routine, null, 2))
      .then(() => {
        // visual feedback
        btnRoutine.classList.add('pulse');
        setTimeout(() => btnRoutine.classList.remove('pulse'), 300);
        console.log('Routine copied to clipboard');
      })
      .catch(err => console.error('Clipboard write failed', err));
  };

  /* ------------------------  Copy Exercises  -------------------------- */
  btnExercises.onclick = () => {
    // Exercise rows in the library panel
    const rows = qa('.sc-5cfead32-0'); // each exercise row card

    const exercises = rows.map(row => {
      const name   = q('p.sc-8f93c0b5-8', row)?.textContent.trim() || '';
      const muscle = q('p.sc-8f93c0b5-9', row)?.textContent.trim() || '';
      return name ? { name, muscle } : null;
    }).filter(Boolean);

    navigator.clipboard
      .writeText(JSON.stringify(exercises, null, 2))
      .then(() => {
        btnExercises.classList.add('pulse');
        setTimeout(() => btnExercises.classList.remove('pulse'), 300);
        console.log('Exercises copied to clipboard');
      })
      .catch(err => console.error('Clipboard write failed', err));
  };

  /* ------------------------  Import Routine  -------------------------- */
  btnImport.onclick = async () => {
    // First click: reveal textarea
    if (importBox.style.display === 'none' || !importBox.style.display) {
      importBox.style.display = 'block';
      importBox.focus();
      btnImport.classList.add('pulse');
      setTimeout(() => btnImport.classList.remove('pulse'), 300);
      return;
    }

    const text = importBox.value.trim();
    if (!text) {
      alert('Please paste routine JSON first');
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      alert('Invalid JSON');
      return;
    }

    await importRoutine(data);
  };

  /* --------------------  Routine Builder Logic  ----------------------- */
  async function importRoutine(routine) {
    if (!routine || !Array.isArray(routine.exercises)) {
      alert('JSON missing exercises array');
      return;
    }

    // Set title if provided
    if (routine.title) {
      const titleInput = q('input[placeholder="Workout Routine Title"]');
      if (titleInput) titleInput.value = routine.title;
    }

    // Map supersetId -> array of exercise names (for linking later)
    const supersets = {};

    /* ----------- 1. Add all exercises (order matters) --------------- */
    for (const ex of routine.exercises) {
      await addExercise(ex);

      if (ex.supersetId != null) {
        supersets[ex.supersetId] ??= [];
        supersets[ex.supersetId].push(ex.name);
      }
    }

    /* ----------- 2. Link supersets ---------------------------------- */
    for (const id in supersets) {
      const names = supersets[id];
      if (names.length < 2) continue;
      const anchorName = names[0];
      for (let i = 1; i < names.length; i++) {
        await linkSuperset(names[i], anchorName);
      }
    }

    /* ----------- 3. Fill notes / rest / sets AFTER linking ----------- */
    for (const ex of routine.exercises) {
      await applyDetails(ex);
    }

    btnImport.classList.add('pulse');
    setTimeout(() => btnImport.classList.remove('pulse'), 300);
  }

  /* ----------------------  UI Interaction Helpers  -------------------- */
  async function addExercise(ex) {
    // Find matching exercise row in library
    const row = qa('.sc-5cfead32-0').find(r => {
      return q('p.sc-8f93c0b5-8', r)?.textContent.trim() === ex.name;
    });
    if (!row) {
      console.warn('Exercise not found in library:', ex.name);
      return;
    }

    // Click the row to add to routine
    row.click();

    // Wait for it to appear in routine list
    await delay(400);
  }

  async function applyDetails(ex) {
    const card = qa('[data-rbd-draggable-id]').find(c => q('p.cAFQFu', c)?.textContent.trim() === ex.name);
    if (!card) return;

    /* Note */
    if (typeof ex.note === 'string') {
      const noteArea = q('textarea', card);
      if (noteArea) noteArea.value = ex.note;
    }

    /* Rest */
    if (ex.rest) {
      const restDisplay = q('.css-gfxedy-singleValue', card);
      if (restDisplay && restDisplay.textContent !== ex.rest) {
        // Attempt direct text replacement (works for contentEditable spans)
        restDisplay.textContent = ex.rest;
      }
      const restInput = q('input[type="text"]', card);
      if (restInput) restInput.value = ex.rest;
    }

    /* Ensure enough set rows */
    if (Array.isArray(ex.sets) && ex.sets.length) {
      const addSetBtn = qa('button', card).find(b => /Add set/i.test(b.textContent));
      let currentRows = qa('.sc-abc5131-2', card);
      while (currentRows.length < ex.sets.length && addSetBtn) {
        addSetBtn.click();
        await delay(120);
        currentRows = qa('.sc-abc5131-2', card);
      }

      // Populate values
      currentRows.forEach((rowSet, i) => {
        const setData = ex.sets[i];
        if (!setData) return;
        const inputs = qa('input', rowSet).filter(el => el.tagName === 'INPUT');
        if (inputs[0]) inputs[0].value = setData.weight ?? '';
        if (inputs[1]) inputs[1].value = setData.reps ?? '';
      });
    }
  }

  async function linkSuperset(name, anchorName) {
    const card = qa('[data-rbd-draggable-id]').find(c => q('p.cAFQFu', c)?.textContent.trim() === name);
    if (!card) return;

    // Open options menu (3 dots)
    const optionsBtn = q('[type="options"]', card)?.parentElement || qa('svg[type="options"]', card)[0]?.parentElement;
    if (!optionsBtn) return;
    optionsBtn.click();

    await delay(250);

    const addItem = qa('.szh-menu__item').find(li => li.textContent.includes('Add to Superset'));
    if (!addItem) return;
    addItem.click();

    await delay(300);
    const modal = q('.ReactModal__Content');
    if (!modal) return;

    const anchorRow = qa('p', modal).find(p => p.textContent.trim() === anchorName)?.closest('[class*="sc-42fff1f3-0"]');
    if (!anchorRow) {
      qa('button', modal).find(b => b.textContent.trim() === 'Cancel')?.click();
      return;
    }

    anchorRow.click();

    await delay(200);
    qa('button', modal).find(b => b.textContent.trim() === 'Cancel')?.click();
  }
})();
