/**
 * smartfill.js v4 — Preenchimento Inteligente
 * Melhorias:
 *  - Navegação próximo / anterior dentro do modal
 *  - Modal fecha SOMENTE no botão X ou em "Aplicar" (não fecha ao clicar fora)
 *  - Campo de edição do nome do aluno dentro do modal
 */

(function () {
  "use strict";

  let _lastValues = {};

  // Lista de todos os alunos da formação ativa (para navegação prev/next)
  let _navList = [];
  let _navIndex = -1;
  let _navFormation = null;

  /**
   * Abre o modal de preenchimento inteligente
   * @param {Object|null} student      — aluno único (ou null para multi)
   * @param {string[]}    selectedIds  — ids dos alunos selecionados
   * @param {string}      formationId  — id da formação ativa
   * @param {Object[]}    [navList]    — lista completa de alunos para navegação (opcional)
   */
  function openModal(student, selectedIds, formationId, navList) {
    const modal = document.getElementById("fillModal");
    if (!modal) return;

    const formation = GT.FORMATIONS.find((f) => f.id === formationId);
    if (!formation) return;

    if (navList) {
      _navList = navList;
      _navFormation = formationId;
    }
    if (student && _navList.length > 0) {
      _navIndex = _navList.findIndex((s) => s.id === student.id);
    }

    _renderModal(student, selectedIds, formationId, formation);
  }

  // ─── render interno (chamado tb pelos botões prev/next) ───────────────────
  function _renderModal(student, selectedIds, formationId, formation) {
    const modal = document.getElementById("fillModal");
    const nameEl = document.getElementById("fillModalStudentName");
    const fieldsEl = document.getElementById("fillModalFields");
    const multiEl = document.getElementById("fillModalMultiNotice");
    const subtitleEl = document.getElementById("fillModalSubtitle");

    const allFields = formation.presencial
      ? GT.EXTRA_FIELDS["presencial"] || []
      : [
          ...GT.UNIVERSAL_FIELDS,
          ...(formation.extra || []).flatMap((ek) => GT.EXTRA_FIELDS[ek] || []),
        ];

    const isMulti = !student && selectedIds && selectedIds.length > 1;
    const isSingle = !!student;

    // ── Nome editável ─────────────────────────────────────────────────────
    nameEl.innerHTML = "";

    if (isSingle) {
      const nameWrap = document.createElement("div");
      nameWrap.className = "modal-name-wrap";

      const nameIcon = document.createElement("span");
      nameIcon.textContent = "👤";
      nameIcon.className = "modal-name-icon";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "modal-name-input";
      nameInput.value = student.nome || "";
      nameInput.placeholder = "Nome do aluno";
      nameInput.title = "Edite e pressione Enter para salvar";

      const saveName = async () => {
        const newName = nameInput.value.trim();
        if (newName && newName !== student.nome) {
          try {
            await GT.updateField(formationId, student.id, "nome", newName);
            student.nome = newName;
            const rowInput = document.querySelector(
              `tr[data-id="${student.id}"] .name-input`,
            );
            if (rowInput) rowInput.value = newName;
            toast("Nome atualizado.", "success");
          } catch (err) {
            toast("Erro ao salvar nome: " + err.message, "error");
          }
        }
      };
      nameInput.addEventListener("blur", saveName);
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          nameInput.blur();
        }
      });

      nameWrap.appendChild(nameIcon);
      nameWrap.appendChild(nameInput);
      nameEl.appendChild(nameWrap);

      subtitleEl.textContent = "Preencha os campos abaixo para este aluno";
      multiEl.classList.add("hidden");
    } else {
      const count = selectedIds ? selectedIds.length : 0;
      nameEl.textContent = `👥 ${count} aluno(s) selecionado(s)`;
      subtitleEl.textContent = "Os campos preenchidos serão aplicados a todos";
      multiEl.innerHTML = `<strong>Preenchimento em lote:</strong> Apenas os campos que você preencher serão aplicados. Campos em branco não serão alterados.`;
      multiEl.classList.remove("hidden");
    }

    // ── Botões prev / next ────────────────────────────────────────────────
    _updateNavButtons();

    // ── Fields ────────────────────────────────────────────────────────────
    fieldsEl.innerHTML = "";
    const formValues = {};
    const defaults = isSingle ? student || {} : _lastValues;

    allFields.forEach((f) => {
      const div = document.createElement("div");
      div.className = "modal-field";

      const label = document.createElement("label");
      label.textContent = f.label;
      div.appendChild(label);

      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        f.options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt || "—";
          if ((defaults[f.key] || "") === opt) o.selected = true;
          input.appendChild(o);
        });
      } else {
        input = document.createElement("input");
        input.type = "number";
        input.min = f.min;
        input.max = f.max;
        input.step = f.step || 1;
        input.placeholder = isMulti ? "— manter atual —" : "";
        if (defaults[f.key] !== undefined && defaults[f.key] !== "") {
          input.value = defaults[f.key];
        }
      }

      input.dataset.fieldKey = f.key;
      input.dataset.fieldType = f.type;
      formValues[f.key] = input;
      div.appendChild(input);
      fieldsEl.appendChild(div);
    });

    modal.classList.remove("hidden");

    // ── Nota Final calculada ao vivo (só para alunos com notas de projeto) ─
    _wireAverageDisplay(fieldsEl, formValues, formation);

    // ── Fechar APENAS pelo X — remove o click-fora ────────────────────────
    modal.onclick = null;

    document.getElementById("fillModalClose").onclick = closeModal;
    document.getElementById("fillModalCancel").onclick = closeModal;

    // ── Aplicar ───────────────────────────────────────────────────────────
    document.getElementById("fillModalApply").onclick = async () => {
      const updates = {};

      allFields.forEach((f) => {
        const input = formValues[f.key];
        if (!input) return;
        if (f.type === "select") {
          const val = input.value;
          if (isMulti && val === "") return;
          updates[f.key] = val;
        } else {
          const raw = input.value.trim();
          if (raw === "") return;
          let v = parseFloat(raw);
          if (!isNaN(v)) {
            v = Math.min(f.max, Math.max(f.min, v));
            updates[f.key] = v;
          }
        }
      });

      if (Object.keys(updates).length === 0) {
        toast("Nenhum campo foi preenchido.", "info");

        return;
      }

      _lastValues = { ..._lastValues, ...updates };

      try {
        if (isSingle) {
          for (const [field, value] of Object.entries(updates)) {
            await GT.updateField(formationId, student.id, field, value);
          }
          toast("Aluno atualizado com sucesso!", "success");
          Object.assign(student, updates);
        } else {
          const ids = selectedIds || [];
          let count = 0;
          for (const id of ids) {
            for (const [field, value] of Object.entries(updates)) {
              await GT.updateField(formationId, id, field, value);
            }
            count++;
          }
          toast(`${count} aluno(s) atualizados!`, "success");
        }

        await Table.render(formationId);
        await Table.updateAllBadges();
      } catch (err) {
        toast("Erro ao salvar: " + err.message, "error");
        console.error(err);
      }
    };
  }

  // ─── Navegação ────────────────────────────────────────────────────────────
  function _updateNavButtons() {
    const prevBtn = document.getElementById("fillModalPrev");
    const nextBtn = document.getElementById("fillModalNext");
    const navInfo = document.getElementById("fillModalNavInfo");
    if (!prevBtn || !nextBtn) return;

    const hasNav = _navList.length > 0 && _navIndex >= 0;
    prevBtn.style.display = hasNav ? "" : "none";
    nextBtn.style.display = hasNav ? "" : "none";
    if (navInfo) navInfo.style.display = hasNav ? "" : "none";

    if (hasNav) {
      prevBtn.disabled = _navIndex <= 0;
      nextBtn.disabled = _navIndex >= _navList.length - 1;
      if (navInfo)
        navInfo.textContent = `${_navIndex + 1} / ${_navList.length}`;
    }
  }

  function _goToIndex(idx) {
    if (idx < 0 || idx >= _navList.length) return;
    _navIndex = idx;
    const student = _navList[idx];
    const formation = GT.FORMATIONS.find((f) => f.id === _navFormation);
    if (!formation) return;
    _renderModal(student, [student.id], _navFormation, formation);
  }

  function closeModal() {
    const modal = document.getElementById("fillModal");
    if (modal) modal.classList.add("hidden");
  }

  // ─── Cálculo de média ao vivo no modal ───────────────────────────────────
  function _wireAverageDisplay(fieldsEl, formValues, formation) {
    // Quais chaves de nota participam do cálculo
    const notaKeys = ["notaFront", "notaBack", "notaProjetoFinal"];
    const relevant = notaKeys.filter((k) => formValues[k]);
    if (relevant.length === 0) return;

    // Cria (ou reutiliza) a div de exibição da média
    let avgDiv = fieldsEl.querySelector(".modal-avg-display");
    if (!avgDiv) {
      avgDiv = document.createElement("div");
      avgDiv.className = "modal-avg-display";
      fieldsEl.appendChild(avgDiv);
    }

    function recalc() {
      const notas = [];
      relevant.forEach((k) => {
        const inp = formValues[k];
        if (!inp) return;
        const v = parseFloat(inp.value);
        if (!isNaN(v)) notas.push(v);
      });
      if (notas.length === 0) {
        avgDiv.innerHTML = "";
        return;
      }
      const avg = notas.reduce((a, b) => a + b, 0) / notas.length;
      avgDiv.innerHTML =
        `<span class="modal-avg-label">Nota Final (média)</span>` +
        `<span class="modal-avg-value">${avg.toFixed(2)}</span>`;
    }

    relevant.forEach((k) => {
      const inp = formValues[k];
      if (inp) inp.addEventListener("input", recalc);
      if (inp) inp.addEventListener("change", recalc);
    });

    recalc(); // exibe ao abrir o modal com valores já preenchidos
  }

  window.SmartFill = { openModal };

  document.addEventListener("DOMContentLoaded", () => {
    document
      .getElementById("fillModalPrev")
      ?.addEventListener("click", () => _goToIndex(_navIndex - 1));
    document
      .getElementById("fillModalNext")
      ?.addEventListener("click", () => _goToIndex(_navIndex + 1));
  });
})();
