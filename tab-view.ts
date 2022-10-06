//
// Copyright © 2021-2022, David Priver
//
type TabView = {
    active_tab_idx: number;
    tabs: Array<HTMLElement>;
    views: Array<HTMLElement>;
    on_change_handler?:(old_idx:number, new_idx:number)=>void;
    change_tab:(_:number) => void;
};

function make_tab_view(tabs:Array<HTMLElement>, views:Array<HTMLElement>, display_?:string):TabView {
    let display = display_?display_:'initial';
    let tv: TabView = {
        active_tab_idx: 0,
        tabs: tabs,
        views: views,
        on_change_handler:undefined,
        change_tab:function(idx:number){
            if(idx >= tv.tabs.length) return;
            if(idx == tv.active_tab_idx) return;
            tv.tabs[tv.active_tab_idx].classList.remove('active');
            tv.views[tv.active_tab_idx].style.display = 'none';
            if(tv.on_change_handler)
                tv.on_change_handler(tv.active_tab_idx, idx);
            tv.active_tab_idx = idx;
            tv.tabs[tv.active_tab_idx].classList.add('active');
            tv.views[tv.active_tab_idx].style.display = display;
        },
    };
    for(let i = 0; i < tabs.length; i++){
        tabs[i].addEventListener('click', function(e){
            e.stopPropagation();
            e.preventDefault();
            tv.change_tab(i);
        });
        views[i].style.display = 'none';
    }
    if(views.length)
        views[0].style.display = display;
    if(tabs.length)
        tabs[0].classList.add('active');
    return tv;
}

