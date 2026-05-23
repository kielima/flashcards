const container = () => document.getElementById('modal-container');

export function showModal({ title, body, buttons = [], menuItems = null }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const close = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay.addEventListener('click', e => {
      if (e.target === overlay) close(null);
    });

    if (menuItems) {
      const menu = document.createElement('div');
      menu.className = 'menu-modal';
      menuItems.forEach(item => {
        const btn = document.createElement('button');
        btn.className = `menu-item${item.danger ? ' danger' : ''}${item.cancel ? ' cancel' : ''}`;
        btn.innerHTML = `${item.icon ? `<span>${item.icon}</span>` : ''}<span>${item.label}</span>`;
        btn.addEventListener('click', () => close(item.value ?? item.label));
        menu.appendChild(btn);
      });
      overlay.appendChild(menu);
    } else {
      const modal = document.createElement('div');
      modal.className = 'modal';

      if (title) {
        const h = document.createElement('h2');
        h.className = 'modal-title';
        h.textContent = title;
        modal.appendChild(h);
      }

      if (typeof body === 'string') {
        const div = document.createElement('div');
        div.innerHTML = body;
        modal.appendChild(div);
      } else if (body instanceof HTMLElement) {
        modal.appendChild(body);
      }

      if (buttons.length) {
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        buttons.forEach(btn => {
          const b = document.createElement('button');
          b.className = `btn ${btn.className || 'btn-ghost'}`;
          b.textContent = btn.label;
          b.addEventListener('click', () => close(btn.value ?? btn.label));
          footer.appendChild(b);
        });
        modal.appendChild(footer);
      }

      overlay.appendChild(modal);
    }

    container().appendChild(overlay);
  });
}

export function closeAllModals() {
  container().innerHTML = '';
}

export function buildForm(fields) {
  const div = document.createElement('div');
  const values = {};
  const inputs = {};

  fields.forEach(field => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = field.label;
    group.appendChild(label);

    let input;
    if (field.type === 'color') {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;';
      input = document.createElement('input');
      input.type = 'color';
      input.value = field.default || '#5B6EF5';
      input.style.cssText = 'width:48px;height:36px;border:none;background:none;cursor:pointer;padding:0;';
      const preview = document.createElement('span');
      preview.textContent = field.default || '#5B6EF5';
      preview.style.cssText = 'font-size:13px;color:var(--text-secondary);font-family:monospace;';
      input.addEventListener('input', () => { preview.textContent = input.value; });
      row.appendChild(input);
      row.appendChild(preview);
      group.appendChild(row);
    } else if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'textarea';
      input.placeholder = field.placeholder || '';
      input.value = field.default || '';
      if (field.rows) input.rows = field.rows;
      group.appendChild(input);
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
      input.className = 'input';
      input.placeholder = field.placeholder || '';
      input.value = field.default || '';
      if (field.maxlength) input.maxLength = field.maxlength;
      if (field.required) input.required = true;
      group.appendChild(input);
    }

    inputs[field.name] = input;
    values[field.name] = () => input.value;
    div.appendChild(group);
  });

  div.getValues = () => {
    const result = {};
    for (const [k, fn] of Object.entries(values)) result[k] = fn();
    return result;
  };
  div.inputs = inputs;

  return div;
}
