(function () {
    'use strict';

    // 1. Read configuration from script tag attributes
    var script = document.currentScript || document.querySelector('script[data-org-id]');
    var orgId = script ? script.getAttribute('data-org-id') : null;
    var apiBase = (script && script.getAttribute('data-api-url')) || 'https://telemetry.bestproduct.me';

    // Storage keys
    var VID_KEY = 'distri-visitor-id';
    var COUNT_KEY = 'distri-visit-count';
    var SYNC_KEY = 'distri-synced';
    var REF_KEY = 'distri-initial-referrer';
    var SESSION_KEY = 'distri-session-active';

    // 2. Capture live referrer immediately (e.g. https://discord.com/, https://www.reddit.com/)
    var currentReferrer = document.referrer || null;

    // 3. Extract & clean campaign click parameter (?clickid= or ?dst_clk=)
    var params = new URLSearchParams(window.location.search);
    var clickId = params.get('clickid') || params.get('dst_clk');

    if (clickId) {
        params.delete('clickid');
        params.delete('dst_clk');
        var cleanQuery = params.toString();
        var cleanUrl = window.location.pathname + (cleanQuery ? '?' + cleanQuery : '') + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    // 4. Resolve Visitor ID & Session / Visit Count
    var visitorId = null;
    var initialReferrer = null;
    var isNewVisitor = false;

    try {
        visitorId = localStorage.getItem(VID_KEY);
        initialReferrer = localStorage.getItem(REF_KEY);
    } catch (e) { }

    if (!visitorId) {
        // Visit #1
        isNewVisitor = true;
        visitorId = 'vis_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).substring(2, 15));
        initialReferrer = currentReferrer || 'direct';

        try {
            localStorage.setItem(VID_KEY, visitorId);
            localStorage.setItem(COUNT_KEY, '1');
            localStorage.setItem(REF_KEY, initialReferrer);
            sessionStorage.setItem(SESSION_KEY, '1');
        } catch (e) { }
    } else {
        // Returning visitor: only increment count once per closed browser session
        try {
            if (!sessionStorage.getItem(SESSION_KEY)) {
                sessionStorage.setItem(SESSION_KEY, '1');
                var count = parseInt(localStorage.getItem(COUNT_KEY) || '1', 10);
                localStorage.setItem(COUNT_KEY, (count + 1).toString());
            }
        } catch (e) { }
    }

    var visitCount = 1;
    var alreadySynced = false;
    try {
        visitCount = parseInt(localStorage.getItem(COUNT_KEY) || '1', 10);
        alreadySynced = localStorage.getItem(SYNC_KEY) === 'true';
    } catch (e) { }

    // 5. Ingestion Trigger Conditions
    var shouldSend = false;

    if (clickId) {
        // Tracked link clicked -> ALWAYS send immediately (captures clickid + live referrer)
        shouldSend = true;
    } else if (!isNewVisitor && visitCount >= 2 && !alreadySynced) {
        // Returning visitor on Visit #2+ -> Promote to backend once
        shouldSend = true;
        try {
            localStorage.setItem(SYNC_KEY, 'true');
        } catch (e) { }
    }

    // If Visit #1 with NO clickid -> Exit immediately (0 network requests, 0 server cost)
    if (!shouldSend) {
        return;
    }

    // 6. Dispatch Beacon
    var payload = JSON.stringify({
        org_id: orgId,
        visitor_id: visitorId,
        click_id: clickId || null,
        visit_count: visitCount,
        document_referrer: currentReferrer,
        initial_referrer: initialReferrer,
        url: window.location.href
    });

    var endpoint = apiBase.replace(/\/$/, '') + '/t/view';

    if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
    } else {
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true
        }).catch(function () { });
    }
})();