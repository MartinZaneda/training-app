#!/usr/bin/env python3
"""Validación end-to-end de exportación, importación, impresión y restablecimiento."""

import argparse
import json
import time

from browser_smoke import DevTools, click, new_page, wait_for


STORAGE_KEY = "entrenamiento.training.v1"
LEGACY_STORAGE_KEY = "constancia.training.v1"


def run(port, base_url):
    entry_url = f"{base_url.rstrip('/')}/?data-actions=6"
    devtools = DevTools(new_page(port, entry_url))
    try:
        devtools.call("Runtime.enable")
        devtools.call("Log.enable")
        devtools.call("Page.enable")
        wait_for(devtools, "document.readyState === 'complete'")

        click(devtools, "[data-action='open-profile']")
        click(devtools, "[data-action='request-reset']")
        click(devtools, "[data-action='confirm-reset']")

        # La actualización de marca conserva y migra los datos ya existentes.
        devtools.evaluate(f"""(() => {{
          const legacy = {{ version: window.TrainingData.appVersion, activeProfile: 'personal', schedules: {{ personal: ['R01', null, null, null, null, null, null] }}, completions: [], preferences: {{ reducedMotion: false }}, activeWorkout: null }};
          localStorage.removeItem({json.dumps(STORAGE_KEY)});
          localStorage.setItem({json.dumps(LEGACY_STORAGE_KEY)}, JSON.stringify(legacy));
        }})()""")
        devtools.call("Page.navigate", {"url": f"{base_url.rstrip('/')}/?legacy-migration=6"})
        time.sleep(0.5)
        wait_for(devtools, f"document.readyState === 'complete' && !!localStorage.getItem({json.dumps(STORAGE_KEY)})")
        assert devtools.evaluate(f"localStorage.getItem({json.dumps(LEGACY_STORAGE_KEY)}) === null")
        assert devtools.evaluate(f"JSON.parse(localStorage.getItem({json.dumps(STORAGE_KEY)})).schedules.personal[0] === 'R01'")
        click(devtools, "[data-action='open-profile']")
        click(devtools, "[data-action='request-reset']")
        click(devtools, "[data-action='confirm-reset']")

        # El estado de referencia incluye planificación y una sesión terminada
        # que no depende de que la rutina siga asignada al plan actual. Se carga
        # mediante la interfaz pública para no introducir un atajo de pruebas.
        devtools.evaluate("""(() => {
          const routine = window.TrainingData.routines.R01;
          const exerciseId = routine.exerciseIds[0];
          const baseCompletion = {
            profileId: 'personal', routineId: 'R01', duration: 42,
            plannedMinutes: routine.estimatedMinutes, plannedSeconds: routine.estimatedMinutes * 60,
            protocolVariantId: null, sessionDurationSeconds: 2511, exercises: 1,
            performance: [{ exerciseId, prescription: routine.items[0].prescription, notes: 'Control estable', effort: 'normal', selection: null, sets: [{ number: 1, reps: 10, durationSeconds: 38, repetitionsInReserve: 2, completed: true, skipped: false, selection: null }] }]
          };
          const completions = Array.from({ length: 25 }, (_, index) => {
            const date = new Date(2026, 7, 25 - index);
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            return { ...baseCompletion, id: `backup-session-${index}`, date: dateKey, completedAt: `${dateKey}T10:30:00.000Z`, performance: structuredClone(baseCompletion.performance) };
          });
          const state = {
            version: window.TrainingData.appVersion,
            activeProfile: 'personal',
            schedules: { personal: ['R01', null, null, null, null, null, null] },
            completions,
            preferences: { reducedMotion: false }, activeWorkout: null
          };
          window.__seedBackupText = JSON.stringify({ product: 'Entrenamiento', formatVersion: 1, appVersion: state.version, exportedAt: new Date().toISOString(), data: state });
          return true;
        })()""")
        click(devtools, "[data-action='open-profile']")
        assert devtools.evaluate("""(() => {
          const input = document.querySelector('[data-import-file]');
          const transfer = new DataTransfer();
          transfer.items.add(new File([window.__seedBackupText], 'seed.json', { type: 'application/json' }));
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()""")
        wait_for(devtools, f"JSON.parse(localStorage.getItem({json.dumps(STORAGE_KEY)})).completions.length === 25")

        # Captura la descarga sin acceder al sistema de archivos del usuario.
        devtools.evaluate("""(() => {
          window.__backupText = '';
          window.__backupFilename = '';
          window.__originalCreateObjectURL = URL.createObjectURL;
          window.__originalRevokeObjectURL = URL.revokeObjectURL;
          window.__originalAnchorClick = HTMLAnchorElement.prototype.click;
          URL.createObjectURL = blob => { blob.text().then(text => { window.__backupText = text; }); return 'blob:captured-backup'; };
          URL.revokeObjectURL = () => {};
          HTMLAnchorElement.prototype.click = function () { window.__backupFilename = this.download; };
        })()""")
        click(devtools, "[data-route='progreso']")
        assert devtools.evaluate("document.querySelectorAll('.history-session').length === 20 && !!document.querySelector('[data-action=load-more-progress]')")
        click(devtools, "[data-action='load-more-progress']")
        assert devtools.evaluate("document.querySelectorAll('.history-session').length === 25 && !document.querySelector('[data-action=load-more-progress]')")
        click(devtools, "[data-view='progreso'] [data-action='export-data']")
        wait_for(devtools, "window.__backupText.length > 0")
        backup = json.loads(devtools.evaluate("window.__backupText"))
        assert backup["product"] == "Entrenamiento"
        assert backup["formatVersion"] == 1
        assert backup["appVersion"]
        assert backup["data"]["completions"][0]["id"] == "backup-session-0"
        assert devtools.evaluate("/^entrenamiento-copia-\\d{4}-\\d{2}-\\d{2}\\.json$/.test(window.__backupFilename)")
        assert devtools.evaluate("document.querySelector('.toast')?.innerText.includes('Copia exportada correctamente')")
        devtools.evaluate("URL.createObjectURL = window.__originalCreateObjectURL; URL.revokeObjectURL = window.__originalRevokeObjectURL; HTMLAnchorElement.prototype.click = window.__originalAnchorClick;")

        # Una copia válida restaura planificación, historial y registros por serie.
        click(devtools, "[data-action='open-profile']")
        click(devtools, "[data-action='request-reset']")
        devtools.evaluate(f"localStorage.setItem({json.dumps(LEGACY_STORAGE_KEY)}, 'legacy-data')")
        click(devtools, "[data-action='confirm-reset']")
        assert devtools.evaluate(f"JSON.parse(localStorage.getItem({json.dumps(STORAGE_KEY)})).completions.length === 0")
        click(devtools, "[data-action='open-profile']")
        imported = devtools.evaluate("""(() => {
          const input = document.querySelector('[data-import-file]');
          const transfer = new DataTransfer();
          transfer.items.add(new File([window.__backupText], 'entrenamiento-copia.json', { type: 'application/json' }));
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()""")
        assert imported
        wait_for(devtools, f"JSON.parse(localStorage.getItem({json.dumps(STORAGE_KEY)})).completions.length === 25")
        restored = json.loads(devtools.evaluate(f"localStorage.getItem({json.dumps(STORAGE_KEY)})"))
        assert restored["schedules"]["personal"][0] == "R01"
        assert restored["completions"][0]["performance"][0]["notes"] == "Control estable"
        assert devtools.evaluate("document.querySelector('.toast')?.innerText.includes('Copia importada correctamente')")

        # JSON inválido y archivos sobredimensionados no pueden alterar el estado.
        before_invalid = devtools.evaluate(f"localStorage.getItem({json.dumps(STORAGE_KEY)})")
        click(devtools, "[data-action='open-profile']")
        devtools.evaluate("""(() => {
          const input = document.querySelector('[data-import-file]');
          const transfer = new DataTransfer();
          transfer.items.add(new File(['{invalid'], 'invalid.json', { type: 'application/json' }));
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        })()""")
        wait_for(devtools, "document.querySelector('.toast.is-error')?.innerText.includes('No es una copia válida')")
        assert devtools.evaluate(f"localStorage.getItem({json.dumps(STORAGE_KEY)})") == before_invalid
        devtools.evaluate("document.querySelector('[data-import-file]').value = ''")
        devtools.evaluate("""(() => {
          const input = document.querySelector('[data-import-file]');
          const transfer = new DataTransfer();
          transfer.items.add(new File(['x'.repeat(window.TrainingStateIO.MAX_BACKUP_BYTES + 1)], 'too-large.json', { type: 'application/json' }));
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        })()""")
        wait_for(devtools, "document.querySelector('.toast.is-error')?.innerText.includes('demasiado grande')")
        assert devtools.evaluate(f"localStorage.getItem({json.dumps(STORAGE_KEY)})") == before_invalid
        click(devtools, "#profile-dialog [data-action='close-dialog']")

        # Imprimir desde cualquier ruta prepara exclusivamente el plan y restaura
        # la navegación al terminar el diálogo de impresión.
        click(devtools, "[data-route='inicio']")
        devtools.evaluate("window.__printCalls = 0; window.__printedPlan = false; window.print = () => { window.__printCalls += 1; window.__printedPlan = !document.querySelector('[data-view=plan]').hidden && document.body.classList.contains('printing-plan'); };")
        click(devtools, "[data-action='open-profile']")
        click(devtools, "#profile-dialog [data-action='print']")
        assert devtools.evaluate("window.__printCalls === 1 && window.__printedPlan")
        assert devtools.evaluate("!document.querySelector('[data-view=inicio]').hidden && document.querySelector('[data-view=plan]').hidden && !document.body.classList.contains('printing-plan')")
        click(devtools, "[data-route='plan']")
        click(devtools, "[data-view='plan'] [data-action='print']")
        assert devtools.evaluate("window.__printCalls === 2 && window.__printedPlan && !document.querySelector('[data-view=plan]').hidden")
        devtools.call("Emulation.setEmulatedMedia", {"media": "print"})
        assert devtools.evaluate("getComputedStyle(document.querySelector('.sidebar')).display === 'none' && getComputedStyle(document.querySelector('[data-view=plan]')).display !== 'none' && getComputedStyle(document.querySelector('[data-view=plan] .button')).display === 'none'")
        devtools.call("Emulation.setEmulatedMedia", {"media": "screen"})

        # Cancelar conserva; confirmar borra historial, planificación y sesión activa.
        click(devtools, "[data-action='open-profile']")
        click(devtools, "[data-action='request-reset']")
        click(devtools, "#confirm-dialog [data-action='close-dialog']")
        assert devtools.evaluate(f"JSON.parse(localStorage.getItem({json.dumps(STORAGE_KEY)})).completions.length === 25")
        click(devtools, "[data-action='open-profile']")
        click(devtools, "[data-action='request-reset']")
        click(devtools, "[data-action='confirm-reset']")
        clean = json.loads(devtools.evaluate(f"localStorage.getItem({json.dumps(STORAGE_KEY)})"))
        assert clean["completions"] == []
        assert clean["schedules"]["personal"] == [None] * 7
        assert clean["activeWorkout"] is None
        assert clean["preferences"] == {"reducedMotion": False}
        assert devtools.evaluate(f"localStorage.getItem({json.dumps(LEGACY_STORAGE_KEY)}) === null")
        assert devtools.evaluate("!document.querySelector('[data-view=inicio]').hidden && location.hash === '#inicio'")
        assert devtools.evaluate("document.querySelectorAll('.brand-mark svg').length === 2 && document.querySelectorAll('.avatar svg').length === 2 && !document.querySelector('[data-profile-initial]')")
        assert not devtools.evaluate("document.body.innerText.includes('Constancia')")

        errors = [event for event in devtools.events if event.get("method") == "Runtime.exceptionThrown" or event.get("method") == "Log.entryAdded" and event.get("params", {}).get("entry", {}).get("level") == "error"]
        assert not errors, json.dumps(errors, ensure_ascii=False)
    finally:
        try:
            devtools.call("Page.close")
        except Exception:
            pass
        devtools.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9223)
    parser.add_argument("--url", default="http://127.0.0.1:4173/")
    arguments = parser.parse_args()
    run(arguments.port, arguments.url)
    print("Data actions browser tests passed: export, import, print, and reset validated end to end.")
