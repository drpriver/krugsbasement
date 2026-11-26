//
// Copyright © 2021-2026, David Priver <david@davidpriver.com>
//
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const phone_size = matchMedia('(pointer: coarse) and (max-width: 700px), (pointer: coarse) and (max-width: 1000px) and (max-height: 540px)');
function layout_preference():'auto'|'mobile'|'desktop'{
    const saved = get_global(StorageCategory.SETTINGS, 'layout');
    return saved === 'mobile' || saved === 'desktop' ? saved : 'auto';
}
function use_phone_layout(preference:string):boolean{
    return SETTINGS.uimode === UiMode.NORMAL &&
        (preference === 'mobile' || (preference === 'auto' && phone_size.matches));
}
let phone_layout = use_phone_layout(layout_preference());
const enum TOUCH {
    LONG_CLICK_WAIT = 300,
}

type PhoneView = 'map' | 'chat' | 'dms' | 'campaign' | 'tools' | 'palette';
type PhoneRoute = {view:PhoneView, panel?:number};
let phone_route:PhoneRoute = {view:'map'};
let phone_panel:HTMLElement|null = null;
let next_panel = Date.now();
const phone_tabs = new Map<PhoneView, PhoneRoute>();

function display_phone_route(route:PhoneRoute):void{
    const old = phone_route;
    phone_panel?.classList.remove('phone-current');
    phone_panel = route.panel ? document.querySelector<HTMLElement>(`[data-phone-panel="${route.panel}"]`) : null;
    if(!phone_panel?.isConnected || phone_panel.style.display === 'none') phone_panel = null;
    phone_route = phone_panel ? route : {view:route.view};
    phone_tabs.set(route.view, phone_route);
    document.body.dataset.mobileView = route.view;
    document.body.classList.toggle('phone-detail', !!phone_panel);
    phone_panel?.classList.add('phone-current');
    const active = route.view === 'tools' || route.view === 'palette' ? 'map' : route.view;
    for(const button of by_id('phone-nav').querySelectorAll('button')){
        if(button.dataset.view === active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    }
    if(old.view === 'dms' && route.view !== 'dms') get_window('privateroll').close();
    if(route.view === 'dms' && old.view !== 'dms') get_window('privateroll').show();
    if(route.view === 'map') requestAnimationFrame(resize_canvas);
}

function phone_navigate(view:PhoneView, panel?:number):void{
    if(!phone_layout || (phone_route.view === view && phone_route.panel === panel)) return;
    const route = {view, panel};
    history.pushState({phone:route, from:phone_route}, '');
    display_phone_route(route);
}

function phone_show_panel(win:HTMLElement):void{
    if(!phone_layout) return;
    if(win.id === 'privateroll-window'){
        phone_navigate('dms');
        return;
    }
    win.dataset.phonePanel ||= String(next_panel++);
    phone_navigate(phone_route.view, Number(win.dataset.phonePanel));
}

function phone_close_panel(win:HTMLElement):void{
    if(!phone_layout || phone_panel !== win) return;
    phone_panel.classList.remove('phone-current');
    phone_panel = null;
    const parent = history.state?.from as PhoneRoute|undefined;
    if(parent?.view === phone_route.view){
        // Search can close and open its result in the same event.
        const closing = phone_route;
        queueMicrotask(()=>{ if(phone_route === closing) history.back(); });
    }
    else {
        const root = {view:phone_route.view};
        history.replaceState({phone:root}, '');
        display_phone_route(root);
    }
}

document.addEventListener('DOMContentLoaded', function():void{
    const nav = by_id('phone-nav');
    const tree = by_id('tree');
    const chat = by_id('chat');
    const viewport = window.visualViewport;
    function fit():void{
        if(!phone_layout) return;
        document.body.style.setProperty('--phone-height', (viewport?.height ?? innerHeight)+'px');
        document.body.style.setProperty('--phone-top', (viewport?.offsetTop ?? 0)+'px');
    }
    const group = by_id('options-layout');
    const choices = group.querySelectorAll('input');
    group.hidden = SETTINGS.uimode !== UiMode.NORMAL;
    function layout():void{
        const preference = layout_preference();
        for(const choice of choices) choice.checked = choice.value === preference;
        document.body.dataset.layout = preference;
        phone_layout = use_phone_layout(preference);
        const legacy = !phone_layout && (preference === 'auto' || SETTINGS.uimode !== UiMode.NORMAL);
        document.body.classList.toggle('legacy-touch-layout', legacy);
        const mobile = phone_layout || (legacy && navigator.userAgent.includes('Mobile'));
        document.body.classList.toggle('mobile', mobile);
        by_id('chatinput').rows = mobile ? 1 : 4;
        by_id('keyboardless-buttons').style.display = IS_TOUCH || phone_layout ? 'grid' : '';
        const changed = document.body.classList.contains('phone') !== phone_layout;
        document.body.classList.toggle('phone', phone_layout);
        if(phone_layout && changed){
            by_id('left').append(tree);
            by_id('privateroll-title').textContent = 'Direct messages';
            fit();
            history.replaceState({phone:{view:'map'}}, '');
            display_phone_route({view:'map'});
        }
        else if(changed){
            chat.insertBefore(tree, by_id('notifications'));
            by_id('privateroll-title').textContent = 'Private Rolls';
            delete document.body.dataset.mobileView;
            document.body.classList.remove('phone-detail');
            phone_panel?.classList.remove('phone-current');
            phone_panel = null;
        }
        if(OPENDIALOG) center_element(OPENDIALOG.window);
        requestAnimationFrame(resize_canvas);
    }
    for(const choice of choices) choice.onchange = ()=>{
        store_global(StorageCategory.SETTINGS, 'layout', choice.value);
        layout();
    };
    layout();
    phone_size.addEventListener('change', layout);
    viewport?.addEventListener('resize', fit);
    viewport?.addEventListener('scroll', fit);
    window.addEventListener('popstate', e=>{
        if(!phone_layout || !e.state?.phone) return;
        if(OPENDIALOG) OPENDIALOG.cancel.click();
        display_phone_route(e.state.phone);
    });
    for(const button of nav.querySelectorAll('button')){
        button.onclick = ()=>{
            const view = button.dataset.view as PhoneView;
            const previous = phone_tabs.get(view);
            phone_navigate(view, view === phone_route.view ? undefined : previous?.panel);
        };
    }
    by_id('phone-tools').onclick = ()=>phone_navigate('tools');
    by_id('phone-finish').onclick = ()=>by_id('finish-click-tool').click();
    by_id('phone-dm-tables').onclick = ()=>{
        const open = by_id('privateroll-container').classList.toggle('phone-tables-open');
        by_id('phone-dm-tables').setAttribute('aria-expanded', String(open));
    };
    by_id('phone-rolls').onclick = ()=>{
        const open = chat.classList.toggle('phone-rolls-open');
        by_id('phone-rolls').setAttribute('aria-expanded', String(open));
    };
});
