#!/usr/bin/env python3
"""Prueba de humo por Chrome DevTools para el flujo real de entrenamiento local."""

import argparse
import base64
import json
import time
import urllib.request
from pathlib import Path

import websocket


class DevTools:
    def __init__(self, endpoint):
        self.socket = websocket.create_connection(endpoint, timeout=10)
        self.sequence = 0
        self.events = []

    def call(self, method, params=None):
        self.sequence += 1
        message_id = self.sequence
        self.socket.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        while True:
            message = json.loads(self.socket.recv())
            if message.get("id") == message_id:
                if "error" in message:
                    raise AssertionError(f"{method}: {message['error']}")
                return message.get("result", {})
            self.events.append(message)

    def evaluate(self, expression):
        result = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in result:
            raise AssertionError(result["exceptionDetails"].get("text", "Error de JavaScript"))
        return result.get("result", {}).get("value")

    def close(self):
        self.socket.close()


def new_page(port, url):
    request = urllib.request.Request(f"http://127.0.0.1:{port}/json/new?{url}", method="PUT")
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)["webSocketDebuggerUrl"]


def click(devtools, selector):
    clicked = devtools.evaluate(
        f"(() => {{ const node = document.querySelector({json.dumps(selector)}); if (!node) return false; node.click(); return true; }})()"
    )
    assert clicked, f"No se encontró {selector}"
    time.sleep(0.15)


def wait_for(devtools, expression, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if devtools.evaluate(expression):
            return
        time.sleep(0.1)
    raise AssertionError(f"Tiempo agotado: {expression}")


def assert_layout_report(name, report):
    assert isinstance(report, dict) and isinstance(report.get("checks"), dict), f"{name}: informe inválido {report!r}"
    failed_checks = [key for key, passed in report["checks"].items() if not passed]
    assert not failed_checks, f"{name}: fallan {', '.join(failed_checks)}; métricas={json.dumps(report.get('metrics', {}), ensure_ascii=False)}"


def mobile_exercise_card_report(devtools):
    return devtools.evaluate(
        """(() => {
          const cards = [...document.querySelectorAll('.exercise-card')].slice(0, 8);
          const card = cards[0];
          const image = card?.querySelector('.exercise-image img');
          const badge = card?.querySelector('.exercise-card-topline .exercise-level-badge');
          const title = card?.querySelector('.exercise-card-title');
          const body = card?.querySelector('.exercise-card-body');
          const meta = card?.querySelector('.exercise-meta');
          const tags = [...meta?.querySelectorAll('.exercise-meta-badge') || []];
          if (!card || !image || !badge || !title || !body || !meta) {
            return { checks: { requiredElements: false }, metrics: { cards: cards.length, tags: tags.length } };
          }

          const cardBox = card.getBoundingClientRect();
          const imageBox = image.getBoundingClientRect();
          const badgeBox = badge.getBoundingClientRect();
          const titleBox = title.getBoundingClientRect();
          const bodyBox = body.getBoundingClientRect();
          const metaBox = meta.getBoundingClientRect();
          const cardStyle = getComputedStyle(card);
          const imageStyle = getComputedStyle(image);
          const badgeStyle = getComputedStyle(badge);
          const metaStyle = getComputedStyle(meta);
          const configuredImageSize = parseFloat(cardStyle.getPropertyValue('--mobile-exercise-image'));
          const tolerance = 1;
          return {
            checks: {
              requiredElements: true,
              eightCards: cards.length === 8,
              threeTagsPerCard: cards.every(item => item.querySelectorAll('.exercise-meta .exercise-meta-badge').length === 3),
              uniformCardHeight: cards.every(item => Math.abs(item.getBoundingClientRect().height - cardBox.height) <= tolerance),
              configuredFixedHeight: Number.isFinite(configuredImageSize) && Math.abs(cardBox.height - configuredImageSize - 2) <= tolerance,
              squareImage: Math.abs(imageBox.width - imageBox.height) <= tolerance,
              imageUsesConfiguredSize: Math.abs(imageBox.height - configuredImageSize) <= tolerance,
              completeImage: imageStyle.objectFit === 'contain' && imageStyle.objectPosition === '50% 50%',
              badgeInsideCard: badgeBox.right <= cardBox.right + tolerance,
              badgeDoesNotOverlapTitle: badgeBox.bottom <= titleBox.top + tolerance,
              visibleBadge: badgeStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && badgeStyle.whiteSpace === 'nowrap',
              truncatedTitle: getComputedStyle(title).whiteSpace === 'nowrap' && getComputedStyle(title).textOverflow === 'ellipsis',
              compactTagLayout: metaStyle.display === 'flex' && metaStyle.overflow === 'hidden',
              truncatedTags: tags.length === 3 && tags.every(tag => {
                const tagStyle = getComputedStyle(tag);
                const labelStyle = getComputedStyle(tag.querySelector(':scope > span'));
                return tagStyle.display === 'flex' && tagStyle.whiteSpace === 'nowrap' && labelStyle.textOverflow === 'ellipsis' && tag.getBoundingClientRect().right <= metaBox.right + tolerance && !/Músculos principales|Coincide:/.test(tag.innerText);
              }),
              metadataInsideBody: metaBox.bottom <= bodyBox.bottom + tolerance
            },
            metrics: {
              viewport: window.innerWidth,
              cardHeight: cardBox.height,
              configuredImageSize,
              imageWidth: imageBox.width,
              imageHeight: imageBox.height,
              badgeBottom: badgeBox.bottom,
              titleTop: titleBox.top,
              metaRight: metaBox.right,
              tagRights: tags.map(tag => tag.getBoundingClientRect().right),
              metaBottom: metaBox.bottom,
              bodyBottom: bodyBox.bottom,
              fontFamily: getComputedStyle(card).fontFamily
            }
          };
        })()"""
    )


def run(port, base_url, screenshot_dir):
    entry_url = f"{base_url.rstrip('/')}/?browser-smoke=6"
    devtools = DevTools(new_page(port, entry_url))
    try:
        devtools.call("Runtime.enable")
        devtools.call("Log.enable")
        devtools.call("Page.enable")
        wait_for(devtools, "document.readyState === 'complete'")
        click(devtools, "[data-action='open-profile']")
        click(devtools, "[data-action='request-reset']")
        click(devtools, "[data-action='confirm-reset']")

        click(devtools, "[data-route='plan']")
        assert devtools.evaluate("document.querySelectorAll('.weekly-preset-option').length === 3")
        assert devtools.evaluate("(() => { const week = document.querySelector('.selected-plan'); const presets = document.querySelector('.weekly-presets'); return !!week && !!presets && !presets.open && presets.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING && document.querySelector('.selected-plan-heading')?.innerText.includes('Tu semana') && presets.querySelector('summary')?.innerText.includes('Planes semanales predefinidos'); })()")
        assert not devtools.evaluate("!!document.querySelector('.plan-summary, .metric-card, .training-days, [data-training-day]')")
        assert devtools.evaluate("(() => { const badge = document.querySelector('.schedule-row.is-today .ui-badge--accent'); const style = badge && getComputedStyle(badge); return badge?.innerText.trim() === 'Hoy' && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.borderRadius === '999px'; })()")
        assert devtools.evaluate("(() => { const row = document.querySelector('.schedule-row'); const day = row?.querySelector('.schedule-day')?.getBoundingClientRect(); const copy = row?.querySelector('.routine-copy')?.getBoundingClientRect(); return day && copy && day.width > row.getBoundingClientRect().width * .9 && day.bottom <= copy.top; })()")
        assert devtools.evaluate("(() => { const rows = [...document.querySelectorAll('.schedule-row')]; const height = rows[0].getBoundingClientRect().height; return Math.abs(height - 132) < 1 && rows.every(row => Math.abs(row.getBoundingClientRect().height - height) < 1) && rows.every(row => ['h3', 'p'].every(selector => getComputedStyle(row.querySelector(`.routine-copy ${selector}`)).whiteSpace === 'nowrap')); })()")
        assert devtools.evaluate("(() => { const offenders = [...document.querySelectorAll('body *')].filter(node => [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim()) && node.getClientRects().length && parseFloat(getComputedStyle(node).fontSize) < 12); return offenders.map(node => `${node.tagName}.${node.className}:${getComputedStyle(node).fontSize}`).join('|'); })()") == ""

        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
        time.sleep(0.2)
        assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert devtools.evaluate("(() => { const row = document.querySelector('.schedule-row'); const day = row?.querySelector('.schedule-day')?.getBoundingClientRect(); const icon = row?.querySelector('.routine-icon')?.getBoundingClientRect(); const actions = row?.querySelector('.routine-actions')?.getBoundingClientRect(); return day && icon && day.bottom <= icon.top && (!actions || actions.top >= icon.top); })()")
        assert devtools.evaluate("(() => { const rows = [...document.querySelectorAll('.schedule-row')]; return rows.every(row => Math.abs(row.getBoundingClientRect().height - 176) < 1); })()")
        if screenshot_dir:
            devtools.evaluate("document.querySelectorAll('.toast').forEach(node => node.remove()); document.querySelector('.selected-plan')?.scrollIntoView({block:'start'})")
            time.sleep(0.2)
            Path(screenshot_dir).mkdir(parents=True, exist_ok=True)
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "plan-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, ".weekly-presets > summary")
        wait_for(devtools, "document.querySelector('.weekly-presets')?.classList.contains('is-expanded')")
        assert devtools.evaluate("(() => { const disclosure = document.querySelector('.weekly-presets'); const options = [...disclosure.querySelectorAll('.weekly-preset-option')]; return disclosure.open && document.documentElement.scrollWidth <= window.innerWidth && options.length === 3 && options.every(option => { const header = option.querySelector('.weekly-preset-header').getBoundingClientRect(); const copy = option.querySelector(':scope > p').getBoundingClientRect(); const action = option.querySelector(':scope > .button').getBoundingClientRect(); return header.bottom <= copy.top && copy.bottom <= action.top && Math.abs(action.width - option.clientWidth + 24) < 1; }); })()")
        click(devtools, ".weekly-presets > summary")
        click(devtools, ".schedule-row [data-action='choose-routine']")
        assert devtools.evaluate("(() => { const dialog = document.querySelector('#exercise-dialog[open]'); const panel = dialog?.querySelector('#routine-filter-panel'); const cards = [...dialog?.querySelectorAll('.routine-picker-item') || []]; return !!dialog?.querySelector('[data-routine-search]') && !!dialog.querySelector('[data-action=\"toggle-routine-filters\"]') && panel?.hidden && cards.length === 97 && cards.every(card => card.children[0].tagName === 'H3' && card.children[1].tagName === 'P' && card.querySelectorAll(':scope > .exercise-meta .ui-badge').length === 3 && !card.querySelector(':scope > small') && card.querySelectorAll('.routine-picker-actions > .button').length === 2); })()")
        devtools.evaluate("(() => { const input = document.querySelector('[data-routine-search]'); input.value = 'Sentadilla de copa y balanceo'; input.dispatchEvent(new Event('input', { bubbles: true })); })()")
        wait_for(devtools, "document.querySelectorAll('.routine-picker-item').length === 1")
        assert devtools.evaluate("document.querySelector('.routine-picker-item h3')?.innerText.trim() === 'Sentadilla de copa y balanceo'")
        assert devtools.evaluate("document.querySelector('[data-routine-search]')?.value === 'Sentadilla de copa y balanceo' && document.querySelector('[data-action=\"clear-routine-search\"]')?.classList.contains('is-visible')")
        click(devtools, "[data-action='toggle-routine-filters']")
        assert devtools.evaluate("(() => { const panel = document.querySelector('#routine-filter-panel'); const groups = [...panel.querySelectorAll(':scope > .filter-group')]; return !panel.hidden && document.querySelector('[data-action=\"toggle-routine-filters\"]')?.getAttribute('aria-expanded') === 'true' && groups.length > 1 && !panel.querySelector('.routine-picker-filter') && groups.every(group => group.parentElement === panel && group.querySelector('.routine-filter-description')?.innerText.trim()); })()")
        assert devtools.evaluate("""(() => { delete window.__filterXss; const target = document.querySelector("#routine-filter-panel [data-action='filter-routine'][data-facet='library']"); target.dataset.value = '<img data-xss-probe src=x onerror=window.__filterXss=1>'; target.click(); return !window.__filterXss && !document.querySelector('[data-xss-probe]') && document.querySelector('[data-action=\"toggle-routine-filters\"] .ui-badge--number')?.innerText === '0'; })()""")
        click(devtools, "#routine-filter-panel [data-action='filter-routine'][data-facet='library']")
        assert devtools.evaluate("document.querySelector('[data-routine-search]')?.value === 'Sentadilla de copa y balanceo' && document.querySelector('[data-action=\"toggle-routine-filters\"] .ui-badge--number')?.innerText === '1'")
        click(devtools, "[data-action='reset-routine-filters']")
        assert devtools.evaluate("document.querySelector('[data-routine-search]')?.value === 'Sentadilla de copa y balanceo' && document.querySelector('[data-action=\"toggle-routine-filters\"] .ui-badge--number')?.innerText === '0' && !document.querySelector('#routine-filter-panel')?.hidden")
        click(devtools, "[data-action='clear-routine-search']")
        assert devtools.evaluate("document.querySelector('[data-routine-search]')?.value === '' && document.querySelectorAll('.routine-picker-item').length === 97 && document.documentElement.scrollWidth <= window.innerWidth")
        assert devtools.evaluate("(() => { const action = document.querySelector('.routine-picker-item [data-routine=\"R47\"]'); const card = action?.closest('.routine-picker-item'); return card?.querySelector(':scope > h3')?.innerText.trim() === 'Caminata suave de recuperación'; })()")
        assert devtools.evaluate("(() => { const card = document.querySelector('.routine-picker-item'); const title = card.querySelector(':scope > h3'); const subtitle = card.querySelector(':scope > p'); const actions = card.querySelector('.routine-picker-actions'); const buttons = [...actions.children]; const cardBox = card.getBoundingClientRect(); const first = buttons[0].getBoundingClientRect(); const second = buttons[1].getBoundingClientRect(); return getComputedStyle(title).textOverflow === 'ellipsis' && getComputedStyle(title).whiteSpace === 'nowrap' && getComputedStyle(subtitle).textOverflow === 'ellipsis' && getComputedStyle(subtitle).whiteSpace === 'nowrap' && Math.abs(first.width - second.width) < 1 && first.left < second.left && actions.getBoundingClientRect().width > cardBox.width * .85 && getComputedStyle(card).transitionProperty.includes('transform'); })()")
        click(devtools, ".routine-picker-item [data-action='preview-picker-routine']")
        assert devtools.evaluate("(() => { const preview = document.querySelector('.routine-preview'); return !!preview?.querySelector('[data-action=\"back-to-routine-picker\"]') && !!preview.querySelector('.routine-preview-footer [data-action=\"assign-routine\"]') && !preview.querySelector('.routine-preview-footer [data-action=\"start-workout\"]'); })()")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "routine-preview-picker-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "[data-action='back-to-routine-picker']")
        assert devtools.evaluate("document.querySelectorAll('.routine-picker-actions').length === 97 && !document.querySelector('#routine-filter-panel')?.hidden")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "routine-picker-mobile.png").write_bytes(base64.b64decode(screenshot))
            click(devtools, "[data-action='toggle-routine-filters']")
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "routine-picker-cards-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "[data-action='preview-picker-routine'][data-routine='H31']")
        assert devtools.evaluate("(() => { const anchors = [...document.querySelectorAll('.routine-preview-equipment [data-equipment-kind=anchor]')]; return anchors.length > 0 && anchors.every(anchor => anchor.querySelector('.detail-equipment-thumb.is-anchor svg.icon') && !anchor.querySelector('.detail-equipment-thumb img')); })()")
        click(devtools, "[data-action='back-to-routine-picker']")
        click(devtools, "#exercise-dialog [data-action='close-dialog']")
        click(devtools, "[data-route='biblioteca']")
        assert devtools.evaluate("[...document.querySelectorAll('.exercise-card .exercise-level-badge')].every(badge => !badge.innerText.includes('–'))")
        assert devtools.evaluate("""(() => { delete window.__filterXss; const target = document.querySelector("[data-action='toggle-exercise-filter']"); target.dataset.value = '<img data-xss-probe src=x onerror=window.__filterXss=1>'; target.click(); return !window.__filterXss && !document.querySelector('[data-xss-probe]') && !document.querySelector("[data-action='toggle-exercise-filter'].is-active"); })()""")
        assert_layout_report("Tarjetas de ejercicios a 390 px", mobile_exercise_card_report(devtools))
        assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        if screenshot_dir:
            devtools.evaluate("document.querySelectorAll('.toast').forEach(node => node.remove())")
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "library-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, ".exercise-card[data-exercise='e14']")
        assert devtools.evaluate("(() => { const dialog = document.querySelector('#exercise-dialog[open]'); const visual = dialog?.querySelector('.exercise-detail-hero'); const image = visual?.querySelector('img'); const close = visual?.querySelector(':scope > .dialog-close'); const thumbs = [...dialog?.querySelectorAll('.detail-equipment-thumb') || []]; const anchors = [...dialog?.querySelectorAll('[data-equipment-kind=anchor]') || []]; if (!dialog || !visual || !image || !close || !thumbs.length || !anchors.length) return false; const dialogBox = dialog.getBoundingClientRect(); const visualBox = visual.getBoundingClientRect(); const imageBox = image.getBoundingClientRect(); const closeBox = close.getBoundingClientRect(); const visualStyle = getComputedStyle(visual); window.__exerciseClosePosition = { top: closeBox.top - dialogBox.top, right: dialogBox.right - closeBox.right }; return Math.abs(window.__exerciseClosePosition.top - 14) < 1 && Math.abs(window.__exerciseClosePosition.right - 14) < 1 && Math.abs(imageBox.width - visualBox.width) < 1 && getComputedStyle(image).maxHeight === 'none' && visualStyle.backgroundColor === 'rgb(255, 255, 255)' && visualStyle.borderBottomStyle !== 'none' && parseFloat(visualStyle.borderBottomWidth) >= 1 && thumbs.every(thumb => getComputedStyle(thumb).backgroundColor === 'rgb(255, 255, 255)') && anchors.every(anchor => anchor.querySelector('.detail-equipment-thumb.is-anchor svg.icon') && !anchor.querySelector('.detail-equipment-thumb img')); })()")
        close_center = devtools.evaluate("(() => { const close = document.querySelector('.exercise-detail-hero > .dialog-close'); const box = close.getBoundingClientRect(); window.__closeBackgroundBeforeHover = getComputedStyle(close).backgroundColor; return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()")
        devtools.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": close_center["x"], "y": close_center["y"]})
        time.sleep(0.2)
        assert devtools.evaluate("(() => { const close = document.querySelector('.exercise-detail-hero > .dialog-close'); const style = getComputedStyle(close); return style.backgroundColor !== window.__closeBackgroundBeforeHover && style.cursor === 'pointer' && parseFloat(style.transitionDuration) > 0 && style.transform !== 'none'; })()")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "exercise-detail-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "[data-action='view-exercise-equipment']")
        assert devtools.evaluate("(() => { const dialog = document.querySelector('#exercise-dialog[open]'); const visual = dialog?.querySelector('.modal-equipment-visual'); const image = visual?.querySelector('img'); const close = dialog?.querySelector('.equipment-modal-header > .dialog-close'); if (!dialog || !visual || !image || !close) return false; const dialogBox = dialog.getBoundingClientRect(); const visualBox = visual.getBoundingClientRect(); const imageBox = image.getBoundingClientRect(); const closeBox = close.getBoundingClientRect(); const visualStyle = getComputedStyle(visual); const currentClosePosition = { top: closeBox.top - dialogBox.top, right: dialogBox.right - closeBox.right }; const redundantAdjustmentBadge = [...dialog.querySelectorAll('.modal-equipment-block .detail-section-heading')].some(heading => /ajustes|posiciones/i.test(heading.innerText) && heading.querySelector('.ui-badge')); return Math.abs(imageBox.width - visualBox.width) < 1 && visualStyle.backgroundColor === 'rgb(255, 255, 255)' && visualStyle.borderBottomStyle !== 'none' && parseFloat(visualStyle.borderBottomWidth) >= 1 && Math.abs(currentClosePosition.top - window.__exerciseClosePosition.top) < 1 && Math.abs(currentClosePosition.right - window.__exerciseClosePosition.right) < 1 && !redundantAdjustmentBadge; })()")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "equipment-detail-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "[data-action='back-to-exercise']")
        assert devtools.evaluate("(() => { const dialog = document.querySelector('#exercise-dialog[open]'); const close = dialog?.querySelector('.exercise-detail-hero > .dialog-close'); if (!dialog || !close) return false; const dialogBox = dialog.getBoundingClientRect(); const closeBox = close.getBoundingClientRect(); return Math.abs(closeBox.top - dialogBox.top - window.__exerciseClosePosition.top) < 1 && Math.abs(dialogBox.right - closeBox.right - window.__exerciseClosePosition.right) < 1; })()")
        click(devtools, "#exercise-dialog [data-action='close-dialog']")
        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 320, "height": 700, "deviceScaleFactor": 1, "mobile": True})
        time.sleep(0.2)
        assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert_layout_report("Tarjetas de ejercicios a 320 px", mobile_exercise_card_report(devtools))
        click(devtools, "[data-route='equipamiento']")
        assert devtools.evaluate("(() => { const text = [...document.querySelectorAll('.weight-chip-list, .band-force-table')].map(node => node.innerText).join(' '); return /\\bkg(?:f)?\\b/.test(text) && !/kilogramos/i.test(text); })()")
        assert devtools.evaluate("[...document.querySelectorAll('.catalog-variants')].every(section => !section.querySelector('.catalog-subheading .ui-badge'))")
        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        click(devtools, "[data-route='plan']")
        time.sleep(0.2)
        click(devtools, ".weekly-presets > summary")
        click(devtools, "[data-action='request-weekly-preset'][data-preset='upper-priority']")
        assert devtools.evaluate("document.querySelectorAll('#confirm-dialog[open] .confirm-preset-days > li').length === 7")
        click(devtools, "[data-action='confirm-weekly-preset']")
        assert devtools.evaluate("(() => { const rests = [...document.querySelectorAll('.schedule-row.rest-row')]; const state = JSON.parse(localStorage.getItem('entrenamiento.training.v1')); return !document.querySelector('.training-days, [data-training-day]') && rests.length === 2 && rests.every(row => row.querySelector('[data-action=choose-routine]') && row.querySelector('.routine-copy h3')?.innerText.trim() === 'Descanso') && !('availableDays' in state); })()")
        click(devtools, ".schedule-row:nth-child(3) [data-action='choose-routine']")
        assert devtools.evaluate("!!document.querySelector('#exercise-dialog[open] [data-routine-search]')")
        click(devtools, ".routine-picker-item [data-action='assign-routine']")
        assert devtools.evaluate("!document.querySelector('.schedule-row:nth-child(3)')?.classList.contains('rest-row')")
        click(devtools, ".schedule-row:nth-child(3) [data-action='choose-routine']")
        click(devtools, "#exercise-dialog [data-action='assign-rest']")
        assert devtools.evaluate("document.querySelector('.schedule-row:nth-child(3)')?.classList.contains('rest-row') && !!document.querySelector('.schedule-row:nth-child(3) [data-action=\"choose-routine\"]')")
        assert devtools.evaluate("(() => { const rows = [...document.querySelectorAll('.schedule-row')]; return rows.every(row => Math.abs(row.getBoundingClientRect().height - 132) < 1); })()")
        click(devtools, ".schedule-row:not(.rest-row) [data-action='preview-routine']")
        assert devtools.evaluate("(() => { const dialog = document.querySelector('#exercise-dialog[open]'); const facts = dialog?.querySelectorAll('.routine-preview-facts > li'); const equipment = dialog?.querySelector('.routine-preview-equipment'); const equipmentItems = [...equipment?.querySelectorAll('.detail-equipment-item') || []]; return !!dialog && !dialog.querySelector('.routine-preview-summary') && facts?.length === 2 && [...facts].map(row => row.querySelector('strong')?.innerText).join('|') === 'Duración|Nivel' && !!dialog.querySelector('.routine-preview-exercises') && dialog.querySelector('.routine-preview-details')?.classList.contains('app-disclosure') && equipmentItems.length === 3 && equipmentItems.every(row => getComputedStyle(row.querySelector('.detail-equipment-thumb')).backgroundColor === 'rgb(255, 255, 255)') && !equipmentItems.some(row => /bandas|pesa rusa/i.test(row.innerText)) && !dialog.querySelector('.routine-meta, .protocol-prescription, .exercise-meta') && !!dialog.querySelector('.routine-preview-footer [data-action=\"start-workout\"]') && !dialog.querySelector('.routine-preview-footer [data-action=\"assign-routine\"], [data-action=\"back-to-routine-picker\"]') && dialog.querySelectorAll('.routine-preview-header p').length === 0 && getComputedStyle(dialog.querySelector('.routine-preview-header h2')).whiteSpace === 'normal' && [...dialog.querySelectorAll('.routine-exercise-row')].every(row => row.querySelectorAll('small').length === 1 && getComputedStyle(row.querySelector('strong')).whiteSpace === 'normal'); })()")
        assert devtools.evaluate("(() => { const center = node => { const box = node.getBoundingClientRect(); return box.top + box.height / 2; }; const rows = [...document.querySelectorAll('.routine-exercise-row')]; const equipmentRows = [...document.querySelectorAll('.detail-equipment-item')]; return rows.length > 0 && rows.every(row => { const marker = row.querySelector(':scope > .history-check'); const copy = row.querySelector(':scope > span:nth-child(2)'); const chevron = row.querySelector(':scope > svg'); const style = getComputedStyle(row); return Math.abs(center(marker) - center(copy)) < 1 && Math.abs(center(marker) - center(chevron)) < 1 && parseFloat(style.paddingTop) <= 8 && parseFloat(style.paddingBottom) <= 8; }) && equipmentRows.every(row => Math.abs(center(row.querySelector(':scope > .detail-equipment-thumb')) - center(row.querySelector(':scope > svg'))) < 1); })()")
        assert not devtools.evaluate("/Secuencia detallada|Descanso y cambios de material|Tipo de rutina:|Zona corporal:/.test(document.querySelector('#exercise-dialog').innerText)")
        assert devtools.evaluate("document.querySelectorAll('#exercise-dialog details:not(.app-disclosure)').length === 0")
        assert devtools.evaluate("(() => { const disclosure = document.querySelector('.routine-preview-details'); const panel = disclosure.querySelector('.app-disclosure-panel'); const style = getComputedStyle(panel); return !disclosure.open && panel.getBoundingClientRect().height < 1 && style.transitionProperty.includes('grid-template-rows') && parseFloat(style.transitionDuration) > 0; })()")
        click(devtools, ".routine-preview-details > summary")
        time.sleep(0.35)
        assert devtools.evaluate("(() => { const disclosure = document.querySelector('.routine-preview-details'); const panel = disclosure.querySelector('.app-disclosure-panel'); const body = panel.querySelector('.app-disclosure-body'); const style = getComputedStyle(body); const internalDividers = [...body.querySelectorAll('section')].filter(section => parseFloat(getComputedStyle(section).borderTopWidth) > 0); return disclosure.open && panel.getBoundingClientRect().height > 20 && parseFloat(style.paddingTop) === parseFloat(style.paddingBottom) && parseFloat(style.paddingTop) > 0 && parseFloat(style.borderTopWidth) === 1 && style.borderTopColor !== 'rgba(0, 0, 0, 0)' && internalDividers.length === 0; })()")
        click(devtools, ".routine-preview-details > summary")
        time.sleep(0.35)
        disclosure_close_debug = devtools.evaluate("JSON.stringify((() => { const disclosure = document.querySelector('.routine-preview-details'); const panel = disclosure.querySelector('.app-disclosure-panel'); const style = getComputedStyle(panel); return { open: disclosure.open, height: panel.getBoundingClientRect().height, rows: style.gridTemplateRows, visibility: style.visibility, opacity: style.opacity }; })())")
        assert devtools.evaluate("!document.querySelector('.routine-preview-details').open && document.querySelector('.routine-preview-details .app-disclosure-panel').getBoundingClientRect().height < 1"), disclosure_close_debug
        click(devtools, ".routine-preview-equipment [data-action='view-routine-equipment']")
        assert devtools.evaluate("!!document.querySelector('.equipment-modal-header [data-action=\"back-to-routine\"]')")
        click(devtools, "[data-action='back-to-routine']")
        assert devtools.evaluate("!!document.querySelector('.routine-preview-footer [data-action=\"start-workout\"]') && !!document.querySelector('.routine-preview-equipment')")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "routine-preview-strength-desktop.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "#exercise-dialog [data-action='close-dialog']")
        click(devtools, "[data-route='inicio']")
        time.sleep(0.25)
        strength_debug = devtools.evaluate("JSON.stringify({hash:location.hash, storage:localStorage.getItem('entrenamiento.training.v1'), today:document.querySelector('.today-card')?.innerText})")
        assert devtools.evaluate("!!document.querySelector('.today-card [data-action=\"start-workout\"]')"), strength_debug
        assert devtools.evaluate("(() => { const card = document.querySelector('.today-card'); const disclosure = card?.querySelector('.today-preparation.app-disclosure'); const days = [...document.querySelectorAll('.week-day-list > .week-day-item')]; const current = document.querySelector('.week-day-item[aria-current=\"date\"]'); const currentIndex = days.indexOf(current); const insights = [...document.querySelectorAll('.insight-card')]; return !document.querySelector('.active-workout-banner, .week-dots, .week-strip, .day-card, [data-view=\"inicio\"] > .home-preparation') && !!disclosure && !disclosure.open && disclosure.querySelector('summary')?.innerText.includes('Antes de empezar') && days.length === 7 && currentIndex >= 0 && days.every((node, index) => { const status = node.querySelector('.week-day-status'); const statusStyle = status && getComputedStyle(status); return node.tagName === 'BUTTON' && node.dataset.action && node.querySelector('.week-day-initial')?.innerText.length === 1 && (index < currentIndex ? !!status?.querySelector('svg') && statusStyle.backgroundColor === 'rgba(0, 0, 0, 0)' : !status) && getComputedStyle(node.querySelector('strong')).textOverflow === 'ellipsis' && (!index || node.getBoundingClientRect().top > days[index - 1].getBoundingClientRect().top); }) && current.classList.contains('is-today') && !current.querySelector('.week-day-status') && getComputedStyle(current).borderColor === 'rgb(44, 104, 79)' && insights.length === 3 && insights.every(insight => { const icon = insight.querySelector('.insight-icon').getBoundingClientRect(); const copy = insight.querySelector('.insight-card-copy').getBoundingClientRect(); const title = insight.querySelector('h3').getBoundingClientRect(); const description = insight.querySelector('p').getBoundingClientRect(); return copy.left > icon.right && Math.abs(title.left - description.left) < 1 && description.top >= title.bottom; }); })()")
        click(devtools, ".week-day-item[data-action='preview-routine']")
        assert devtools.evaluate("!!document.querySelector('#exercise-dialog[open] .routine-preview')")
        click(devtools, "#exercise-dialog [data-action='close-dialog']")
        click(devtools, ".today-preparation > summary")
        wait_for(devtools, "document.querySelector('.today-preparation')?.classList.contains('is-expanded')")
        assert devtools.evaluate("(() => { const body = document.querySelector('.today-preparation .app-disclosure-body'); const style = getComputedStyle(body); return document.querySelectorAll('.today-preparation .home-preparation-list > article').length > 0 && parseFloat(style.paddingTop) === parseFloat(style.paddingBottom) && style.borderTopColor !== 'rgba(0, 0, 0, 0)'; })()")
        click(devtools, ".today-preparation > summary")
        click(devtools, ".today-card [data-action='start-workout']")
        wait_for(devtools, "document.querySelector('#workout-screen')?.hidden === false")
        assert devtools.evaluate("document.querySelector('#workout-screen').tagName === 'SECTION'")
        assert devtools.evaluate("document.querySelector('.app-shell').hidden")
        assert devtools.evaluate("document.querySelector('.workout-back')?.innerText.includes('Volver')")
        assert devtools.evaluate("!!document.querySelector('[data-action=\"request-workout-reset\"]')")
        assert devtools.evaluate("(() => { const clock = document.querySelector('.workout-session-clock'); const reset = document.querySelector('.workout-session-reset'); const title = document.querySelector('.workout-player-title'); const center = node => { const box = node.getBoundingClientRect(); return box.top + box.height / 2; }; return clock?.getAttribute('role') === 'timer' && clock.getAttribute('aria-label') === 'Tiempo transcurrido de la sesión' && !clock.querySelector('span') && !document.querySelector('.workout-player-header')?.innerText.includes('TIEMPO DE SESIÓN') && Math.abs(center(clock) - center(reset)) < 1 && Math.abs(center(clock) - center(title)) < 1; })()")
        assert not devtools.evaluate("!!document.querySelector('.workout-step-list')")
        assert not devtools.evaluate("!!document.querySelector('dialog[open]')")
        assert devtools.evaluate("(() => { const position = document.querySelector('.workout-position'); const timer = document.querySelector('.workout-timer-stage'); const exercise = document.querySelector('.workout-exercise'); return timer?.querySelector('.set-control') && position.compareDocumentPosition(timer) & Node.DOCUMENT_POSITION_FOLLOWING && timer.compareDocumentPosition(exercise) & Node.DOCUMENT_POSITION_FOLLOWING; })()")
        assert devtools.evaluate("document.querySelectorAll('.set-row').length") >= 2
        assert devtools.evaluate("document.querySelectorAll('[data-action=\"workout-set-effort\"]').length === 0")
        assert devtools.evaluate("!!document.querySelector('[data-workout-control=\"load\"]')")
        wait_for(devtools, "[...document.querySelectorAll('select')].every(select => select.closest('.custom-select'))")
        assert not devtools.evaluate("!!document.querySelector('.workout-exercise-heading .set-target-badge')")
        assert devtools.evaluate("!!document.querySelector('.set-control .workout-panel-heading .set-target-badge.ui-badge')")
        assert devtools.evaluate("(() => { const style = getComputedStyle(document.querySelector('.set-control .set-target-badge')); return style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.color !== style.backgroundColor && parseFloat(style.fontSize) >= 12; })()")
        assert devtools.evaluate("document.querySelector('[data-action=\"workout-complete-set\"]')?.innerText.includes('Completar y descansar')")
        assert devtools.evaluate("(() => { const box = document.querySelector('.set-inputs'); return box && ['load', 'reps', 'reserve'].every(name => box.querySelector(`[data-workout-control=\"${name}\"]`)); })()")
        assert devtools.evaluate("[...document.querySelector('[data-workout-control=\"load\"]').options].every(option => / kg$/.test(option.textContent) && !option.textContent.includes('kilogramos'))")
        assert devtools.evaluate("[...document.querySelectorAll('#workout-screen input, #workout-screen select, #workout-screen textarea')].every(node => node.closest('label') || node.getAttribute('aria-label'))")
        assert not devtools.evaluate("/\\b(?:E|R|H)\\d{2}\\b|\\b(?:HIIT|EMOM|HIFT|RIR)\\b/.test(document.querySelector('#workout-screen').innerText)")
        assert devtools.evaluate("document.querySelector('.workout-timer').classList.contains('is-paused')")
        assert not devtools.evaluate("!!document.querySelector('.workout-timer-status')")
        assert devtools.evaluate("document.querySelector('[data-action=\"workout-timer-toggle\"]')?.innerText.includes('Iniciar')")
        assert devtools.evaluate("getComputedStyle(document.querySelector('.mobile-exercise-details')).display !== 'none' && !document.querySelector('.exercise-guidance')")
        devtools.evaluate("window.__pausedTimerColor = getComputedStyle(document.querySelector('.workout-timer')).color")

        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
        time.sleep(0.25)
        assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert devtools.evaluate("(() => { const visual = document.querySelector('.workout-exercise-visual').getBoundingClientRect(); const exercise = document.querySelector('.workout-exercise').getBoundingClientRect(); const heading = document.querySelector('.workout-exercise-heading').getBoundingClientRect(); return Math.abs(visual.width - exercise.width) < 1 && heading.bottom <= visual.top; })()")
        assert devtools.evaluate("(() => { const image = document.querySelector('.workout-exercise-visual img'); const bounds = image.getBoundingClientRect(); const container = image.parentElement.getBoundingClientRect(); const style = getComputedStyle(image); return style.objectFit === 'contain' && style.maxHeight === 'none' && style.aspectRatio === 'auto' && Math.abs(bounds.width - container.width) < 1 && Math.abs(bounds.width / bounds.height - image.naturalWidth / image.naturalHeight) < .01; })()")
        assert devtools.evaluate("(() => { const fields = ['load', 'reps', 'reserve'].map(name => document.querySelector(`[data-workout-control=\"${name}\"]`).closest('.workout-field').getBoundingClientRect()); return fields[0].top < fields[1].top && fields[1].top < fields[2].top; })()")
        assert devtools.evaluate("(() => { const actions = document.querySelector('.complete-set-actions'); const button = actions.querySelector('[data-action=\"workout-complete-set\"]'); const duration = actions.querySelector('.rest-duration-control'); return duration.getBoundingClientRect().left >= button.getBoundingClientRect().right && duration.innerText.includes('s') && duration.getBoundingClientRect().width < button.getBoundingClientRect().width; })()")
        assert devtools.evaluate("document.querySelector('.mobile-exercise-details').classList.contains('workout-details')")
        assert devtools.evaluate("(() => { const technique = document.querySelector('.mobile-exercise-details'); const preparation = document.querySelector('.material-preparation-details'); technique.open = true; preparation.open = true; const properties = node => { const style = getComputedStyle(node); return [style.fontSize, style.fontWeight, style.color, style.lineHeight]; }; const bodies = [technique, preparation].map(details => details.querySelector('.app-disclosure-body')); const matches = JSON.stringify(properties(technique.querySelector('summary'))) === JSON.stringify(properties(preparation.querySelector('summary'))) && bodies.every(body => [...body.querySelectorAll('section')].every(section => parseFloat(getComputedStyle(section).borderTopWidth) === 0)); technique.open = false; preparation.open = false; return matches; })()")
        assert devtools.evaluate("(() => { const details = document.querySelector('.mobile-exercise-details'); const active = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; const source = window.TrainingData.exercises.find(exercise => exercise.id === active.steps[active.currentStepIndex].exerciseId); details.open = true; const headings = [...details.querySelectorAll('.workout-reference-section h4')].map(node => node.textContent.trim()); const steps = [...details.querySelectorAll('.workout-technique-steps > li')].map(node => node.textContent.trim()); const safety = [...details.querySelectorAll('.workout-safety-points > li')].map(node => node.textContent.trim()); const valid = details.querySelector('.workout-technique-steps').tagName === 'OL' && JSON.stringify(headings) === JSON.stringify(['Técnica', 'Seguridad']) && steps.length === source.steps.length && safety.length >= 2 && new Set(safety.map(point => point.toLocaleLowerCase('es'))).size === safety.length && !details.innerText.includes(source.dose); details.open = false; return valid; })()")
        assert devtools.evaluate("(() => { const copy = document.querySelector('.workout-exercise-copy'); const details = [...copy.children].filter(node => node.tagName === 'DETAILS'); const stage = document.querySelector('.workout-timer-stage'); const timer = stage.querySelector('.workout-timer'); const preparation = stage.querySelector('.material-preparation-details'); const actions = stage.querySelector('.timer-actions'); const active = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; const source = window.TrainingData.exercises.find(exercise => exercise.id === active.steps[active.currentStepIndex].exerciseId); preparation.open = true; const angles = [...source.equipment.matchAll(/\\d+(?:–\\d+)?°/g)].map(match => match[0]); const valid = details.length === 1 && details[0].querySelector('summary').textContent.trim() === 'Técnica y seguridad' && preparation.querySelector('summary').textContent.trim() === 'Preparación de material' && timer.compareDocumentPosition(preparation) & Node.DOCUMENT_POSITION_FOLLOWING && preparation.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING && preparation.querySelectorAll('.workout-material-list > li').length >= 1 && angles.every(angle => preparation.innerText.includes(angle)) && preparation.innerText.includes('Configuración del ejercicio') && !document.querySelector('.workout-series-details'); preparation.open = false; return valid; })()")
        devtools.evaluate("window.__closedChevronContainerTransform = getComputedStyle(document.querySelector('[data-workout-control=\"load\"] + .custom-select-trigger .custom-select-chevron')).transform; window.__closedChevronIconTransform = getComputedStyle(document.querySelector('[data-workout-control=\"load\"] + .custom-select-trigger .custom-select-chevron svg')).transform")
        click(devtools, "[data-workout-control='load'] + .custom-select-trigger")
        assert devtools.evaluate("!!document.querySelector('[data-workout-control=\"load\"]')?.closest('.custom-select.is-open')")
        assert devtools.evaluate("(() => { const root = document.querySelector('[data-workout-control=\"load\"]')?.closest('.custom-select'); const popover = root?.querySelector('.custom-select-popover'); const field = root?.closest('.workout-field'); const panel = root?.closest('.workout-panel'); return [root, popover, field, panel].every(node => getComputedStyle(node).zIndex === '2147483647'); })()")
        assert devtools.evaluate("getComputedStyle(document.querySelector('[data-workout-control=\"load\"] + .custom-select-trigger .custom-select-chevron')).transform === window.__closedChevronContainerTransform")
        assert devtools.evaluate("getComputedStyle(document.querySelector('[data-workout-control=\"load\"] + .custom-select-trigger .custom-select-chevron svg')).transform !== window.__closedChevronIconTransform")
        assert devtools.evaluate("getComputedStyle(document.querySelector('[data-workout-control=\"load\"]')?.closest('.custom-select').querySelector('.custom-select-popover')).display !== 'none'")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir).mkdir(parents=True, exist_ok=True)
            Path(screenshot_dir, "workout-selector-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "[data-workout-control='load'] ~ .custom-select-popover [data-value='10']")
        assert devtools.evaluate("document.querySelector('[data-workout-control=\"load\"] + .custom-select-trigger .custom-select-value').textContent === '10 kg'")
        click(devtools, "[data-workout-control='reps'] + .custom-select-trigger")
        click(devtools, "[data-workout-control='reps'] ~ .custom-select-popover [data-value='9']")
        click(devtools, "[data-workout-control='reserve'] + .custom-select-trigger")
        click(devtools, "[data-workout-control='reserve'] ~ .custom-select-popover [data-value='3']")
        wait_for(devtools, "(() => { const state = JSON.parse(localStorage.getItem('entrenamiento.training.v1')); const step = state?.activeWorkout?.steps?.[0]; return step?.selection?.loadKg === 10 && step?.sets?.[0]?.reps === 9 && step?.sets?.[0]?.repetitionsInReserve === 3; })()")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "workout-series-mobile.png").write_bytes(base64.b64decode(screenshot))

        click(devtools, "[data-action='workout-timer-toggle']")
        time.sleep(1.1)
        assert devtools.evaluate("document.querySelector('[data-workout-timer]').textContent !== '00:00'")
        assert devtools.evaluate("document.querySelector('.workout-timer').classList.contains('is-running')")
        assert devtools.evaluate("getComputedStyle(document.querySelector('.workout-timer')).color !== window.__pausedTimerColor")
        assert devtools.evaluate("document.querySelector('[data-action=\"workout-timer-toggle\"]')?.innerText.includes('Pausar') && !!document.querySelector('[data-action=\"workout-timer-toggle\"] svg')")
        click(devtools, "[data-action='workout-complete-set']")
        assert devtools.evaluate("!!document.querySelector('.rest-panel')")
        assert devtools.evaluate("document.querySelector('.workout-timer-stage > .rest-panel')?.compareDocumentPosition(document.querySelector('.workout-exercise')) & Node.DOCUMENT_POSITION_FOLLOWING")
        assert devtools.evaluate("(() => { const panel = document.querySelector('.rest-panel'); const timer = panel.querySelector('.workout-timer'); const preparation = panel.querySelector('.material-preparation-details'); const actions = panel.querySelector('.timer-actions'); return !!preparation && timer.compareDocumentPosition(preparation) & Node.DOCUMENT_POSITION_FOLLOWING && preparation.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING; })()")
        assert devtools.evaluate("document.querySelector('.rest-panel .workout-timer').classList.contains('is-running')")
        wait_for(devtools, "JSON.parse(localStorage.getItem('entrenamiento.training.v1') || 'null')?.activeWorkout?.steps?.[0]?.sets?.[0]?.completed === true")
        assert devtools.evaluate("(() => { const set = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.steps[0].sets[0]; return set.reps === 9 && set.repetitionsInReserve === 3 && set.selection.loadKg === 10; })()")
        click(devtools, "[data-action='close-workout']")
        assert devtools.evaluate("document.querySelector('#workout-screen').hidden")
        assert not devtools.evaluate("document.querySelector('.app-shell').hidden")
        assert devtools.evaluate("!document.querySelector('.active-workout-banner') && document.querySelector('.today-card [data-action=\"start-workout\"]')?.innerText.includes('Reanudar sesión') && !!document.querySelector('.today-card .home-session-progress')")
        click(devtools, ".today-card [data-action='start-workout']")
        assert devtools.evaluate("document.querySelector('.set-row.is-complete')?.textContent.includes('Serie 1')")
        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        time.sleep(0.25)
        assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        desktop_bounds = devtools.evaluate("(() => { const rect = document.querySelector('.workout-main').getBoundingClientRect(); return {left:rect.left, right:rect.right, width:rect.width, viewport:document.documentElement.clientWidth, marginLeft:getComputedStyle(document.querySelector('.workout-main')).marginLeft, marginRight:getComputedStyle(document.querySelector('.workout-main')).marginRight}; })()")
        assert abs(desktop_bounds["left"] - (desktop_bounds["viewport"] - desktop_bounds["width"]) / 2) < 1, desktop_bounds
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir).mkdir(parents=True, exist_ok=True)
            Path(screenshot_dir, "workout-desktop.png").write_bytes(base64.b64decode(screenshot))

        for width, height in ((768, 1024), (320, 700)):
            devtools.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": True})
            time.sleep(0.2)
            assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"Desbordamiento horizontal a {width} px"
            assert devtools.evaluate("document.querySelector('#workout-screen').getBoundingClientRect().width === window.innerWidth")

        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
        time.sleep(0.25)
        assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert devtools.evaluate("document.querySelector('#workout-screen').getBoundingClientRect().width === window.innerWidth")
        assert devtools.evaluate("getComputedStyle(document.querySelector('.set-list-panel')).display === 'none'")
        assert devtools.evaluate("getComputedStyle(document.querySelector('.compact-set-progress')).display !== 'none'")
        assert devtools.evaluate("!!document.querySelector('.compact-set-back[aria-label^=\"Volver a la serie\"]')")
        assert devtools.evaluate("document.querySelector('.rest-panel [data-workout-timer]').getBoundingClientRect().bottom <= window.innerHeight")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir).mkdir(parents=True, exist_ok=True)
            Path(screenshot_dir, "workout-mobile.png").write_bytes(base64.b64decode(screenshot))

        assert devtools.evaluate("document.querySelector('.compact-set-progress strong').textContent.startsWith('1 de ')")
        click(devtools, "[data-action='workout-skip-rest']")
        click(devtools, "[data-action='workout-complete-set']")
        assert devtools.evaluate("document.querySelector('.compact-set-progress strong').textContent.startsWith('2 de ')")
        click(devtools, ".compact-set-back")
        assert devtools.evaluate("document.querySelector('.compact-set-progress strong').textContent.startsWith('1 de ') && document.querySelector('.compact-set-track').getAttribute('aria-valuenow') === '1'")
        click(devtools, ".set-row[data-set='2']")
        assert devtools.evaluate("document.querySelector('.compact-set-progress strong').textContent.startsWith('2 de ') && document.querySelector('.compact-set-track').getAttribute('aria-valuenow') === '2'")

        effort_screenshot_taken = False
        for _ in range(90):
            if devtools.evaluate("!!document.querySelector('[data-action=\"finish-workout\"]')"):
                break
            if devtools.evaluate("!!document.querySelector('.effort-rating [data-action=\"workout-set-effort\"]:not(.is-selected)')") and not devtools.evaluate("!!document.querySelector('.effort-rating .effort-button.is-selected')"):
                current_step = devtools.evaluate("JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.currentStepIndex")
                level = "easy" if current_step == 0 else "normal"
                assert devtools.evaluate("!!document.querySelector('[data-action=\"workout-repeat-exercise\"]') && !!document.querySelector('[data-action=\"workout-next-exercise\"]')")
                if screenshot_dir and not effort_screenshot_taken:
                    devtools.evaluate("document.querySelector('.effort-rating').scrollIntoView({block:'center'})")
                    time.sleep(0.2)
                click(devtools, f".effort-rating [data-action='workout-set-effort'][data-effort='{level}']")
                wait_for(devtools, f"JSON.parse(localStorage.getItem('entrenamiento.training.v1'))?.activeWorkout?.steps?.[{current_step}]?.effort === '{level}'")
                current_step_after_effort = devtools.evaluate("JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.currentStepIndex")
                effort_transition_debug = devtools.evaluate("(() => { const workout = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; return JSON.stringify({current:workout.currentStepIndex, readyToFinish:workout.readyToFinish, steps:workout.steps.map(step => ({effort:step.effort, complete:step.sets.every(set => set.completed || set.skipped)}))}); })()")
                assert current_step_after_effort == current_step, (current_step, current_step_after_effort, effort_transition_debug)
                assert devtools.evaluate("!!document.querySelector('[data-action=\"workout-next-exercise\"]')")
                if screenshot_dir and not effort_screenshot_taken:
                    devtools.call("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})
                    time.sleep(0.2)
                    assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                    devtools.evaluate("document.querySelector('.effort-rating').scrollIntoView({block:'center'})")
                    screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
                    Path(screenshot_dir, "effort-desktop.png").write_bytes(base64.b64decode(screenshot))
                    devtools.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
                    time.sleep(0.2)
                    assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                    devtools.evaluate("document.querySelector('.effort-rating').scrollIntoView({block:'center'})")
                    screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
                    Path(screenshot_dir, "effort-mobile.png").write_bytes(base64.b64decode(screenshot))
                    effort_screenshot_taken = True
                if current_step == 1 and not devtools.evaluate("window.__repeatExerciseVerified === true"):
                    devtools.evaluate("window.__repeatExerciseVerified = true")
                    click(devtools, "[data-action='workout-repeat-exercise']")
                    wait_for(devtools, "(() => { const step = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.steps[1]; return step.effort === null && step.sets.every(set => !set.completed && !set.skipped); })()")
            elif devtools.evaluate("!!document.querySelector('[data-action=\"workout-next-exercise\"]')"):
                click(devtools, "[data-action='workout-next-exercise']")
            elif devtools.evaluate("!!document.querySelector('[data-action=\"workout-skip-rest\"]')"):
                click(devtools, "[data-action='workout-skip-rest']")
            elif devtools.evaluate("!!document.querySelector('[data-action=\"workout-complete-set\"]')"):
                click(devtools, "[data-action='workout-complete-set']")
            else:
                raise AssertionError("La sesión de fuerza no ofrece la siguiente acción")
        else:
            raise AssertionError("La sesión de fuerza no llegó al resumen final")
        assert devtools.evaluate("JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.steps[0].effort === 'easy'")
        assert devtools.evaluate("JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.steps.every(step => !step.sets.some(set => set.completed) || ['easy', 'normal', 'hard'].includes(step.effort))")
        click(devtools, "[data-action='finish-workout']")
        assert devtools.evaluate("JSON.parse(localStorage.getItem('entrenamiento.training.v1')).completions[0].performance.length > 0 && location.hash === '#progreso' && document.querySelector('[data-view=\"progreso\"]')?.hidden === false")
        assert devtools.evaluate("(() => { const set = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).completions[0].performance[0].sets[0]; return set.reps === 9 && set.repetitionsInReserve === 3 && set.selection.loadKg === 10; })()")
        click(devtools, "[data-route='inicio']")
        assert devtools.evaluate("(() => { const item = document.querySelector('.week-day-item.is-done[aria-current=\"date\"]'); const style = item && getComputedStyle(item); return !!item && !item.querySelector('.week-day-status') && style.backgroundColor === 'rgb(44, 104, 79)' && style.color === 'rgb(255, 255, 255)'; })()")
        click(devtools, "[data-route='progreso']")
        assert devtools.evaluate("!!document.querySelector('.history-session')")
        assert devtools.evaluate("document.querySelectorAll('.progress-summary > article').length === 4 && !document.querySelector('[data-view=\"progreso\"] .equipment-section') && !!document.querySelector('[data-progress-search]') && !!document.querySelector('[data-progress-range]')")
        assert devtools.evaluate("document.querySelectorAll('details:not(.app-disclosure)').length === 0")
        click(devtools, ".history-session > summary")
        assert devtools.evaluate("document.querySelectorAll('.performance-entry').length > 0")
        assert devtools.evaluate("document.querySelector('.performance-effort-badge.ui-badge')?.innerText.includes('Subir carga')")
        assert devtools.evaluate("!!document.querySelector('.session-facts') && !document.querySelector('[data-view=\"progreso\"] .equipment-card')")
        devtools.evaluate("(() => { const input = document.querySelector('[data-progress-search]'); input.value = 'resultado imposible de encontrar'; input.dispatchEvent(new Event('input', { bubbles: true })); })()")
        wait_for(devtools, "document.querySelectorAll('.history-session').length === 0 && !!document.querySelector('[data-action=reset-progress-filters]')")
        click(devtools, "[data-action='reset-progress-filters']")
        assert devtools.evaluate("document.querySelectorAll('.history-session').length === 1 && document.querySelector('[data-progress-search]').value === '' && document.querySelector('[data-progress-range]').value === 'all'")
        click(devtools, "[data-action='open-profile']")
        click(devtools, "[data-action='request-reset']")
        click(devtools, "[data-action='confirm-reset']")
        click(devtools, "[data-route='plan']")
        click(devtools, ".weekly-presets > summary")
        click(devtools, "[data-action='request-weekly-preset'][data-preset='conditioning-priority']")
        click(devtools, "[data-action='confirm-weekly-preset']")
        click(devtools, ".schedule-row [data-action='preview-routine'][data-routine='H01']")
        assert devtools.evaluate("(() => { const dialog = document.querySelector('#exercise-dialog[open]'); const facts = [...dialog?.querySelectorAll('.routine-preview-facts > li') || []]; const structure = dialog?.querySelector('.routine-preview-structure'); const steps = [...structure?.querySelectorAll(':scope > ol > li') || []]; return !!dialog?.querySelector('.routine-preview-protocol') && !dialog.querySelector('.routine-preview-summary') && facts.length === 3 && facts.map(row => row.querySelector(':scope > strong')?.innerText).join('|') === 'Duración|Nivel|Estructura' && steps.length === 2 && steps.every(step => step.innerText.trim()) && !structure.innerText.includes('→') && dialog.querySelector('.routine-preview-equipment .detail-equipment-item') && dialog.querySelector('.routine-preview-details')?.classList.contains('app-disclosure') && dialog.querySelectorAll('.routine-exercise-row').length === 1 && dialog.querySelectorAll('.routine-exercise-row small').length === 0 && !dialog.querySelector('.routine-meta, .protocol-prescription, .exercise-meta') && !!dialog.querySelector('.routine-preview-footer [data-action=\"start-workout\"]'); })()")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "routine-preview-hiit-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "#exercise-dialog [data-action='close-dialog']")
        click(devtools, ".schedule-row [data-action='preview-routine'][data-routine='H24']")
        assert devtools.evaluate("(() => { const structure = document.querySelector('.routine-preview-structure'); const steps = [...structure?.querySelectorAll(':scope > ol > li') || []]; return steps.length === 5 && steps.every(step => step.innerText.trim() && !step.innerText.includes('→')) && steps.filter(step => step.innerText.includes('Recuperación: 30 segundos')).length === 4 && steps.at(-1).innerText === 'Repite 5 rondas'; })()")
        click(devtools, "#exercise-dialog [data-action='close-dialog']")
        click(devtools, ".schedule-row [data-action='preview-routine'][data-routine='H01']")
        click(devtools, ".routine-preview-footer [data-action='start-workout']")
        wait_for(devtools, "document.querySelector('#workout-screen')?.hidden === false")
        assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert devtools.evaluate("document.querySelector('.app-shell').hidden")
        assert not devtools.evaluate("!!document.querySelector('dialog[open]')")
        assert not devtools.evaluate("!!document.querySelector('.interval-settings, .interval-timer-explanation, .interval-sequence-summary')")
        assert devtools.evaluate("!!document.querySelector('.interval-status-row') && !!document.querySelector('.interval-progress')")
        assert devtools.evaluate("document.querySelector('.interval-primary').getBoundingClientRect().bottom <= window.innerHeight")
        assert not devtools.evaluate("!!document.querySelector('.interval-protocol-mobile, .interval-protocol-desktop')")
        assert devtools.evaluate("document.querySelector('[data-action=\"workout-start-warmup\"]')?.innerText.includes('Empezar calentamiento')")
        assert devtools.evaluate("(() => { const timer = document.querySelector('.interval-primary .workout-timer'); const guidance = document.querySelector('.interval-phase-guidance'); const cue = guidance?.querySelector('strong'); const start = document.querySelector('[data-action=\"workout-start-warmup\"]'); return guidance?.innerText.trim() === 'Rema suave y aumenta la intensidad.' && cue.scrollWidth <= cue.clientWidth && timer.compareDocumentPosition(guidance) & Node.DOCUMENT_POSITION_FOLLOWING && guidance.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING; })()")
        assert devtools.evaluate("(() => { const active = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; return active.phase === 'ready' && active.sessionTimer.running === false && active.sessionTimer.elapsedSeconds === 0; })()")
        assert devtools.evaluate("document.querySelectorAll('.interval-movement').length > 0")
        assert devtools.evaluate("document.querySelector('.interval-movement.is-current .interval-movement-title .interval-movement-state.ui-badge--success')?.innerText.trim() === 'Actual'")
        assert devtools.evaluate("[...document.querySelectorAll('.interval-movement-visual img')].every(image => getComputedStyle(image).objectFit === 'contain')")
        assert devtools.evaluate("[...document.querySelectorAll('.interval-movement')].every(card => card.querySelector(':scope > .interval-movement-title') && card.querySelector(':scope > .interval-movement-visual') && card.querySelector(':scope > .equipment-log') && card.querySelector(':scope > .interval-movement-details'))")
        assert devtools.evaluate("[...document.querySelectorAll('.interval-movement-details')].every(details => [...details.querySelectorAll('.workout-reference-section > h4')].map(node => node.textContent).join('|') === 'Técnica|Seguridad')")
        assert devtools.evaluate("(() => { const card = document.querySelector('.interval-movement'); const title = card.querySelector('.interval-movement-title').getBoundingClientRect(); const visual = card.querySelector('.interval-movement-visual').getBoundingClientRect(); const equipment = card.querySelector('.equipment-log').getBoundingClientRect(); return Math.abs(title.width - card.clientWidth + 18) < 3 && visual.width > 0 && equipment.width > visual.width * 1.65; })()")
        assert devtools.evaluate("document.querySelectorAll('.interval-movement [data-action=\"workout-set-effort\"]').length === 0")
        assert not devtools.evaluate("/\\b(?:E|R|H)\\d{2}\\b|\\b(?:HIIT|EMOM|HIFT|RIR)\\b/.test(document.querySelector('#workout-screen').innerText)")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "interval-mobile.png").write_bytes(base64.b64decode(screenshot))
        for width, height in ((320, 700), (768, 900)):
            devtools.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": True})
            time.sleep(0.2)
            assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"Desbordamiento HIIT a {width} px"
        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        time.sleep(0.2)
        assert devtools.evaluate("document.documentElement.scrollWidth <= window.innerWidth && !document.querySelector('.interval-protocol-desktop, .interval-protocol-mobile')")
        assert devtools.evaluate("(() => { const main = document.querySelector('.interval-workout-main').getBoundingClientRect(); return Math.abs(main.left - (document.documentElement.clientWidth - main.width) / 2) < 1; })()")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "interval-desktop.png").write_bytes(base64.b64decode(screenshot))
        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
        time.sleep(0.2)
        click(devtools, "[data-action='workout-start-warmup']")
        assert devtools.evaluate("(() => { const active = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; return active.phase === 'warmup' && active.timer.mode === 'countdown' && active.timer.durationSeconds === active.interval.warmupSeconds && active.timer.running && active.sessionTimer.running; })()")
        assert devtools.evaluate("(() => { const timer = document.querySelector('.interval-primary .workout-timer'); const guidance = document.querySelector('.interval-phase-guidance'); const cue = guidance?.querySelector('strong'); const start = document.querySelector('[data-action=\"workout-start-intervals\"]'); return document.querySelector('.interval-hero').classList.contains('is-warmup') && start?.innerText.trim() === 'Empezar' && document.querySelector('.interval-timer-caption')?.innerText.includes('restante de calentamiento') && guidance?.innerText.trim() === 'Rema suave y aumenta la intensidad.' && cue.scrollWidth <= cue.clientWidth && timer.compareDocumentPosition(guidance) & Node.DOCUMENT_POSITION_FOLLOWING && guidance.compareDocumentPosition(start.closest('.timer-actions')) & Node.DOCUMENT_POSITION_FOLLOWING; })()")
        click(devtools, "[data-action='workout-start-intervals']")
        assert devtools.evaluate("JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.phase === 'interval'")
        assert devtools.evaluate("!!document.querySelector('[data-action=\"workout-next-interval\"]')")
        assert devtools.evaluate("(() => { const guidance = document.querySelector('.interval-phase-guidance'); return guidance?.innerText.trim() === 'Rema a una intensidad fuerte pero sostenible.' && guidance.querySelectorAll(':scope > strong').length === 1 && !guidance.querySelector('p') && !guidance.innerText.includes('Qué hacer ahora') && getComputedStyle(guidance.querySelector('strong')).whiteSpace === 'nowrap'; })()")
        click(devtools, "[data-action='workout-next-interval']")
        assert devtools.evaluate("document.querySelector('.interval-hero').classList.contains('is-recovery') && document.querySelector('.interval-phase-guidance')?.innerText.trim() === 'Rema con intensidad fácil.'")
        click(devtools, "[data-action='workout-next-interval']")
        assert devtools.evaluate("document.querySelector('.interval-hero').classList.contains('is-work') && document.querySelector('.interval-phase-guidance')?.innerText.trim() === 'Rema a una intensidad fuerte pero sostenible.'")
        assert devtools.evaluate("!document.querySelector('.interval-settings') && !!document.querySelector('.interval-movement-list.is-active')")
        assert devtools.evaluate("document.querySelectorAll('.interval-movement-list.is-active .interval-movement').length > 0")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "interval-active-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "[data-action='request-workout-reset']")
        assert devtools.evaluate("document.querySelector('#confirm-dialog[open]')?.innerText.includes('Reiniciar esta sesión')")
        click(devtools, "[data-action='confirm-workout-reset']")
        wait_for(devtools, "(() => { const active = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; return active.phase === 'ready' && active.interval.currentInterval === 1 && active.interval.completed === false && active.movements.every(movement => movement.effort === null); })()")
        assert devtools.evaluate("(() => { const active = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; return active.sessionTimer.elapsedSeconds === 0 && !document.querySelector('.workout-player-header .workout-progress') && !!document.querySelector('.interval-progress') && !document.querySelector('dialog[open]'); })()")
        assert not devtools.evaluate("!!document.querySelector('[data-workout-control=\"interval-rounds\"], [data-workout-control=\"interval-total\"], [data-workout-control=\"interval-work\"], [data-workout-control=\"interval-recovery\"]')")
        click(devtools, "[data-action='workout-start-warmup']")
        click(devtools, "[data-action='workout-start-intervals']")
        click(devtools, "[data-action='workout-next-interval']")
        recovery_debug = devtools.evaluate("(() => { const active = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; return JSON.stringify({phase:active.phase, interval:active.interval, hero:document.querySelector('.interval-hero')?.className, status:document.querySelector('.interval-status-row')?.innerText}); })()")
        assert devtools.evaluate("document.querySelector('.interval-hero').classList.contains('is-recovery') && /recuperación|pausa/.test(document.querySelector('.interval-status-row').innerText.toLocaleLowerCase('es'))"), recovery_debug
        for _ in range(24):
            if devtools.evaluate("JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.phase === 'cooldown'"):
                break
            click(devtools, "[data-action='workout-next-interval']")
        assert devtools.evaluate("(() => { const active = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; return active.phase === 'cooldown' && active.interval.completed === false && active.timer.mode === 'countdown' && active.timer.durationSeconds === active.interval.cooldownSeconds && active.timer.running && active.sessionTimer.running; })()")
        assert devtools.evaluate("document.querySelector('.interval-hero').classList.contains('is-cooldown') && document.querySelector('.interval-timer-caption')?.innerText.includes('restante de enfriamiento') && document.querySelector('[data-action=\"workout-finish-cooldown\"]')?.innerText.trim() === 'Terminar'")
        click(devtools, "[data-action='workout-finish-cooldown']")
        assert devtools.evaluate("(() => { const active = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout; return active.phase === 'complete' && active.interval.completed === true && active.sessionTimer.running === false; })()")
        time.sleep(0.3)
        assert devtools.evaluate("document.querySelector('[data-workout-timer]')?.innerText.trim() === '00:00'")
        assert devtools.evaluate("document.querySelectorAll('.interval-movement [data-action=\"workout-set-effort\"]').length === document.querySelectorAll('.interval-movement').length * 3")
        assert not devtools.evaluate("!!document.querySelector('[data-action=\"workout-focus-missing-effort\"], .interval-session-completion [data-action=\"finish-workout\"]')")
        click(devtools, ".interval-movement [data-action='workout-set-effort'][data-effort='normal']")
        assert devtools.evaluate("JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.movements[0].effort === 'normal'")
        assert devtools.evaluate("document.querySelector('.interval-session-completion:last-child [data-action=\"finish-workout\"]')?.innerText.includes('Terminar sesión')")
        if screenshot_dir:
            devtools.evaluate("document.querySelector('.interval-movement .effort-rating').scrollIntoView({block:'center'})")
            time.sleep(0.2)
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "interval-effort-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "[data-action='finish-workout']")
        assert devtools.evaluate("JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout === null && location.hash === '#progreso' && document.querySelector('[data-view=\"progreso\"]')?.hidden === false")
        assert devtools.evaluate("(() => { const completion = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).completions[0]; return completion.protocolVariantId === 'standard' && completion.plannedSeconds === 1860 && completion.plannedMinutes === 31; })()")

        circuit_injection = devtools.evaluate("""(() => {
          try {
            const stored = JSON.parse(localStorage.getItem('entrenamiento.training.v1'));
            stored.activeWorkout = window.TrainingWorkout.createWorkout({
              routine: window.TrainingData.routines.H17,
              exercises: window.TrainingData.exercises,
              inventory: window.TrainingData,
              date: '2026-08-24',
              now: Date.now()
            });
            localStorage.setItem('entrenamiento.training.v1', JSON.stringify(stored));
            location.reload();
            return 'ok';
          } catch (error) {
            return error.stack || String(error);
          }
        })()""")
        assert circuit_injection == "ok", circuit_injection
        wait_for(devtools, "document.readyState === 'complete' && !!document.querySelector('.today-card [data-action=\"start-workout\"]')")
        assert devtools.evaluate("!document.querySelector('.active-workout-banner') && document.querySelector('.today-card [data-action=\"start-workout\"]')?.innerText.includes('Empezar de nuevo')")
        click(devtools, ".today-card [data-action='start-workout']")
        wait_for(devtools, "document.querySelector('#workout-screen')?.hidden === false")
        assert devtools.evaluate("(() => { const interval = JSON.parse(localStorage.getItem('entrenamiento.training.v1')).activeWorkout.interval; return interval.roundCount === 3 && interval.stepsPerRound === 5 && interval.totalIntervals === 15; })()")
        assert not devtools.evaluate("!!document.querySelector('.interval-circuit-position')")
        assert not devtools.evaluate("!!document.querySelector('.interval-timer-explanation, .interval-sequence-summary')")
        assert devtools.evaluate("document.querySelectorAll('.interval-movement').length === 5 && document.querySelector('.interval-movement.is-current') === document.querySelector('.interval-movement')")
        assert devtools.evaluate("document.querySelector('.interval-movement.is-current .interval-movement-title .interval-movement-state.ui-badge--success')?.innerText.trim() === 'Actual' && document.querySelector('.interval-movement.is-next .interval-movement-title .interval-movement-state.ui-badge--info')?.innerText.trim() === 'Siguiente'")
        assert devtools.evaluate("(() => { const header = document.querySelector('.interval-movement.is-current .interval-movement-title'); const badge = header?.querySelector('.interval-movement-state'); const heading = header?.querySelector('h3'); if (!header || !badge || !heading) return false; const headerBox = header.getBoundingClientRect(); const badgeBox = badge.getBoundingClientRect(); const headingBox = heading.getBoundingClientRect(); return badgeBox.right <= headerBox.right + 1 && badgeBox.right > headerBox.right - 5 && badgeBox.left > headerBox.left + headerBox.width / 2 && badgeBox.bottom <= headingBox.top; })()")
        if screenshot_dir:
            screenshot = devtools.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            Path(screenshot_dir, "interval-circuit-mobile.png").write_bytes(base64.b64decode(screenshot))
        click(devtools, "[data-action='workout-start-warmup']")
        click(devtools, "[data-action='workout-start-intervals']")
        assert devtools.evaluate("document.querySelector('.interval-circuit-position')?.innerText.includes('Ronda completa') && document.querySelector('.interval-circuit-position')?.innerText.includes('Ejercicio de la ronda')")
        assert devtools.evaluate("[...document.querySelectorAll('.interval-movement')].map(card => card.dataset.movementIndex).join(',') === '0,1,2,3,4'")
        click(devtools, "[data-action='workout-next-interval']")
        click(devtools, "[data-action='workout-next-interval']")
        assert devtools.evaluate("document.querySelector('.interval-circuit-position')?.innerText.includes('2 de 5')")
        assert devtools.evaluate("document.querySelectorAll('.interval-movement').length === 5 && [...document.querySelectorAll('.interval-movement')].map(card => card.dataset.movementIndex).join(',') === '1,2,3,4,0'")
        assert devtools.evaluate("document.querySelector('.interval-movement.is-current') === document.querySelector('.interval-movement')")

        click(devtools, "[data-action='close-workout']")
        wait_for(devtools, "document.querySelector('.app-shell')?.hidden === false")
        responsive_routes = ("inicio", "plan", "biblioteca", "equipamiento", "progreso")
        responsive_sizes = ((320, 700), (360, 780), (390, 844), (430, 860), (768, 900), (821, 900), (900, 900), (901, 900), (1024, 900), (1440, 1000))
        for width, height in responsive_sizes:
            devtools.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": width <= 900})
            devtools.call("Page.reload", {"ignoreCache": True})
            wait_for(devtools, "document.readyState === 'complete' && !!document.querySelector('.app-shell')")
            for route in responsive_routes:
                click(devtools, f"[data-route='{route}']")
                audit = devtools.evaluate(r"""(() => {
                  const visible = node => {
                    const style = getComputedStyle(node);
                    const box = node.getBoundingClientRect();
                    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight;
                  };
                  const labelFor = node => node.closest('label') || (node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`)) || node.getAttribute('aria-label') || node.getAttribute('aria-labelledby');
                  const active = document.querySelector('.view:not([hidden])');
                  const activeBox = active?.getBoundingClientRect();
                  const duplicateIds = [...document.querySelectorAll('[id]')].map(node => node.id).filter((id, index, ids) => ids.indexOf(id) !== index);
                  const tinyText = [...document.querySelectorAll('body *')].filter(node => visible(node) && [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim()) && parseFloat(getComputedStyle(node).fontSize) < 12).map(node => `${node.tagName}.${node.className}:${getComputedStyle(node).fontSize}`);
                  const unnamedActions = [...document.querySelectorAll('button, a[href]')].filter(node => visible(node) && !(node.innerText.trim() || node.getAttribute('aria-label') || node.getAttribute('title'))).map(node => `${node.tagName}.${node.className}`);
                  const smallTargets = [...document.querySelectorAll('button, a[href], input, select, textarea')].filter(node => visible(node) && !node.disabled && (node.getBoundingClientRect().width < 24 || node.getBoundingClientRect().height < 24)).map(node => { const box = node.getBoundingClientRect(); return `${node.tagName}.${node.className}:${Math.round(box.width)}x${Math.round(box.height)}`; });
                  const unlabeledFields = [...document.querySelectorAll('input, select, textarea')].filter(node => visible(node) && !labelFor(node)).map(node => `${node.tagName}#${node.id}.${node.className}`);
                  const imagesWithoutAlt = [...document.querySelectorAll('img')].filter(node => visible(node) && !node.hasAttribute('alt')).map(node => node.src);
                  const internalCodes = active?.innerText.match(/\b(?:E|R|H)\d{2}\b|\b(?:HIIT|EMOM|HIFT|RIR)\b/g) || [];
                  const malformedBadges = [...active.querySelectorAll('.ui-badge')].filter(node => { const style = getComputedStyle(node); return !['flex', 'inline-flex'].includes(style.display) || style.borderRadius !== '999px' || parseFloat(style.minHeight) !== 26 || parseFloat(style.fontSize) < 12 || style.whiteSpace !== 'nowrap'; }).map(node => node.className);
                  const malformedNumberBadges = [...active.querySelectorAll('.ui-badge--number')].filter(node => { const style = getComputedStyle(node); return !style.fontVariantNumeric.includes('tabular-nums') || style.justifyContent !== 'center' || parseFloat(style.minWidth) < 26; }).map(node => node.className);
                  const legacyBadges = [...active.querySelectorAll('.streak-badge, .schedule-today-badge, .exercise-badge, .tag, .quantity-pill, .target-chip')].map(node => node.className);
                  const truncatedNavigationLabels = [...document.querySelectorAll('.bottom-nav .nav-link > span:last-child')].filter(node => visible(node) && node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.trim());
                  const compactNavigation = getComputedStyle(document.querySelector('.mobile-header')).display !== 'none' && getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none' && getComputedStyle(document.querySelector('.sidebar')).display === 'none';
                  const wideNavigation = getComputedStyle(document.querySelector('.mobile-header')).display === 'none' && getComputedStyle(document.querySelector('.bottom-nav')).display === 'none' && getComputedStyle(document.querySelector('.sidebar')).display !== 'none';
                  return { viewportWidth: innerWidth, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), activeOutside: !activeBox || activeBox.left < -.5 || activeBox.right > document.documentElement.clientWidth + .5, duplicateIds, tinyText, unnamedActions, smallTargets, unlabeledFields, imagesWithoutAlt, internalCodes, malformedBadges, malformedNumberBadges, legacyBadges, truncatedNavigationLabels, compactNavigation, wideNavigation };
                })()""")
                expected_navigation = audit["compactNavigation"] if width <= 900 else audit["wideNavigation"]
                failures = {key: value for key, value in audit.items() if key not in ("viewportWidth", "compactNavigation", "wideNavigation") and value not in (0, False, [])}
                assert audit["viewportWidth"] == width and expected_navigation and not failures, f"Auditoría {route} a {width} px: {json.dumps(audit, ensure_ascii=False)}"

        devtools.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
        devtools.call("Page.reload", {"ignoreCache": True})
        wait_for(devtools, "document.readyState === 'complete' && !!document.querySelector('.app-shell')")

        def audit_detail_surface(kind, record_id):
            audit = devtools.evaluate(r"""(() => {
              const root = document.querySelector('#exercise-dialog[open]');
              if (!root) return { missing: true };
              const visible = node => {
                const style = getComputedStyle(node);
                const box = node.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
              };
              const tinyText = [...root.querySelectorAll('*')].filter(node => visible(node) && [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim()) && parseFloat(getComputedStyle(node).fontSize) < 12).map(node => `${node.tagName}.${node.className}`);
              const unnamedActions = [...root.querySelectorAll('button, a[href]')].filter(node => visible(node) && !(node.innerText.trim() || node.getAttribute('aria-label') || node.getAttribute('title'))).map(node => `${node.tagName}.${node.className}`);
              const imagesWithoutAlt = [...root.querySelectorAll('img')].filter(node => !node.hasAttribute('alt')).map(node => node.src);
              const internalCodes = root.textContent.match(/\b(?:E|R|H)\d{2}\b|\b(?:HIIT|EMOM|HIFT|RIR|DB|KB|ROW|CU|CR)\b/g) || [];
              const malformedBadges = [...root.querySelectorAll('.ui-badge')].filter(node => { const style = getComputedStyle(node); return !['flex', 'inline-flex'].includes(style.display) || style.borderRadius !== '999px' || parseFloat(style.minHeight) !== 26 || parseFloat(style.fontSize) < 12; }).map(node => node.className);
              const legacyBadges = [...root.querySelectorAll('.exercise-badge, .tag, .quantity-pill, .target-chip')].map(node => node.className);
              return { missing: false, overflow: Math.max(0, root.scrollWidth - document.documentElement.clientWidth), tinyText, unnamedActions, imagesWithoutAlt, internalCodes, malformedBadges, legacyBadges };
            })()""")
            failures = {key: value for key, value in audit.items() if value not in (0, False, [])}
            assert not failures, f"Detalle {kind} {record_id}: {json.dumps(audit, ensure_ascii=False)}"

        click(devtools, "[data-route='biblioteca']")
        exercise_ids = devtools.evaluate("window.TrainingData.exercises.map(item => item.id)")
        for exercise_id in exercise_ids:
            assert devtools.evaluate(f"(() => {{ const node = document.querySelector('.exercise-card[data-exercise={json.dumps(exercise_id)}]'); if (!node) return false; node.click(); return true; }})()")
            audit_detail_surface("ejercicio", exercise_id)
            devtools.evaluate("document.querySelector('#exercise-dialog').close()")

        click(devtools, "[data-route='plan']")
        click(devtools, ".schedule-row [data-action='choose-routine']")
        routine_ids = devtools.evaluate("Object.keys(window.TrainingData.routines)")
        for routine_id in routine_ids:
            assert devtools.evaluate(f"(() => {{ const node = document.querySelector('[data-action=preview-picker-routine][data-routine={json.dumps(routine_id)}]'); if (!node) return false; node.click(); return true; }})()")
            audit_detail_surface("rutina", routine_id)
            assert devtools.evaluate("(() => { const node = document.querySelector('[data-action=back-to-routine-picker]'); if (!node) return false; node.click(); return true; })()")
        devtools.evaluate("document.querySelector('#exercise-dialog').close()")

        click(devtools, "[data-action='open-profile']")
        click(devtools, "[data-action='request-reset']")
        click(devtools, "[data-action='confirm-reset']")
        click(devtools, "[data-route='plan']")
        click(devtools, ".weekly-presets > summary")
        click(devtools, "[data-action='request-weekly-preset'][data-preset='upper-priority']")
        click(devtools, "[data-action='confirm-weekly-preset']")
        click(devtools, "[data-route='inicio']")
        click(devtools, ".today-card [data-action='start-workout']")
        wait_for(devtools, "document.querySelector('#workout-screen')?.hidden === false")
        devtools.evaluate("Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true }); window.__timerAlarmStarts = 0; window.__timerAudioStart = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...args) { window.__timerAlarmStarts += 1; return window.__timerAudioStart.apply(this, args); };")
        click(devtools, "[data-action='workout-complete-set']")
        wait_for(devtools, "performance.getEntriesByName(new URL('public/audio/timer-alarm.wav', location.href).href).length > 0")
        time.sleep(0.5)
        devtools.evaluate("window.__timerRealDateNow = Date.now; Date.now = () => window.__timerRealDateNow() + 600000;")
        wait_for(devtools, "window.__timerAlarmStarts === 2")
        devtools.evaluate("Date.now = window.__timerRealDateNow; AudioBufferSourceNode.prototype.start = window.__timerAudioStart;")
        assert not devtools.evaluate("!!document.querySelector('.rest-panel')")

        relevant_errors = []
        for event in devtools.events:
            if event.get("method") == "Runtime.exceptionThrown":
                relevant_errors.append(event)
            if event.get("method") == "Log.entryAdded" and event.get("params", {}).get("entry", {}).get("level") == "error":
                relevant_errors.append(event)
        assert not relevant_errors, json.dumps(relevant_errors, ensure_ascii=False)
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
    parser.add_argument("--screenshots")
    arguments = parser.parse_args()
    run(arguments.port, arguments.url, arguments.screenshots)
    print("Browser smoke passed: canonical UI data, accessibility, responsive routes, strength diary, and interval player validated.")
