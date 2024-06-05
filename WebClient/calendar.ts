type Calendar = {
    starting_year: number;
    starting_day_of_week: number;
    month_names: Array<string>;
    month_lengths: Array<number>;
    weekday_names: Array<string>
    weekday_length: number;
    flags: CalendarFlags;
    years: Map<number, Map<number, Array<string>>>;
    ending_year: number;
    set_day: (year:number, month:number, day:number, txt:string)=>void;
    add_year: ()=>void;
    activate: (year:number, month:number) => void;
};
let _CALENDAR: Calendar;

function get_day_array(calendar:Calendar, year:number, month:number):Array<string>{
    const y = calendar.years.get(year);
    if(!y) return [];
    const m = y.get(month);
    if(!m) return [];
    return m;
}
function get_day(calendar:Calendar, year:number, month:number, day:number):string{
    const da = get_day_array(calendar, year, month);
    if(da.length) return da[day];
    return '';
}
function set_day(calendar:Calendar, year:number, month:number, day:number, txt:string):void{
    let y = calendar.years.get(year);
    if(!y) {
        y = new Map();
        calendar.years.set(year, y);
    }
    let m = y.get(month);
    if(!m) {
        let len = month_len(calendar, year, month);
        m = [];
        for(let i = 0; i < len; i++){
            m.push('');
        }
        y.set(month, m);
    }
    m[day] = txt;
}
function month_len(calendar: Calendar, year:number, month:number):number{
    if(!(calendar.flags & CalendarFlags.GREGORIAN))
        return calendar.month_lengths[month];
    if(month != 1) // "february"
        return calendar.month_lengths[month];
    let add_one = 0;
    if(year % 4 == 0 && (year % 400 == 0 || !(year % 100 == 0)))
        add_one = 1;
    return calendar.month_lengths[month] + add_one;
}

function first_day_of_month(calendar: Calendar, year:number, month:number):number{
    let d = calendar.starting_day_of_week;
    const nmonths = calendar.month_names.length;
    for(let y = calendar.starting_year;y<=year;y++){
        if(y == year)
            for(let m = 0;m!=month;m++)
                d += month_len(calendar, y, m);
        else
            for(let m = 0; m < nmonths; m++)
                d += month_len(calendar, y, m);
    }

    d %= calendar.weekday_length;
    return d;
}
function init_calendar(calendar: Calendar, days: Array<CalendarDay>):void{
    for(const d of days){
        const [year, month, day, txt] = d;
        if(year > calendar.ending_year)
            calendar.ending_year = year;
        if(year < calendar.starting_year){
            // TODO: invalid?
            continue;
        }
        let m = calendar.years.get(year);
        if(!m){
            m = new Map();
            calendar.years.set(year, m);
        }
        let day_array = m.get(month);
        if(!day_array){
            day_array = [];
            const mlen = month_len(calendar, year, month);
            for(let i = 0; i < mlen; i++){
                day_array.push('');
            }
            m.set(month, day_array);
        }
        day_array[day] = txt;
    }
}
function build_calendar_window(calendar:Calendar):void{
    const w = get_window('cal');
    function year_month():[number, number]{
        let year = dv.active1;
        if(year === undefined) year = calendar.starting_year;
        let month = dv.active2.get(year);
        if(month === undefined) month = 0;
        return [year, month];
    }
    w.handle.oncontextmenu = function(e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.item('Show Other People', function():void{
            const [year, month] = year_month();
            EMIT(FromClient.CALENDAR, [CalendarMsgType.SHOW, year, month]);
        });
        menu.separator();
        menu.canceller();
        menu.install();
    };
    const openid = 'cal/open'
    w.hide_handler = function(){
        store_local(StorageCategory.WINDOW, openid, '');
    };
    w.show_handler = function(){
        store_local(StorageCategory.WINDOW, openid, '1');
    };
    const year_selector = by_id('cal-year-selector');
    year_selector.replaceChildren();
    year_selector.style.gridTemplateRows = 'max-content max-content';
    calendar.add_year = function():void{
        year_selector.style.gridTemplateRows += ' max-content';
        ++calendar.ending_year
        dv.add_item1(''+calendar.ending_year, calendar.ending_year);
        const nmonths = calendar.month_names.length;
        for(let m = 0; m < nmonths; m++){
            const mn = calendar.month_names[m];
            dv.add_item2(mn, calendar.ending_year, m);
        }
    };
    elem_parent_text(year_selector, 'button', 'Add Year', null, null).onclick = function(e){
        e.stopPropagation();
        e.preventDefault();
        const d = get_dialog('simple-confirm');
        if(!d) return;
        d.f.title.textContent = 'Add Year?';
        d.show_handler = function(){
            setTimeout(()=>{d.f.ok.focus();}, 0);
        };
        d.ok_handler = function(){
            EMIT(FromClient.CALENDAR, [CalendarMsgType.ADDYEAR]);
        };
        d.show();
    };

    const month_selector = by_id('cal-month-selector');
    month_selector.replaceChildren();
    let longest_month = 0;
    for(let ml of calendar.month_lengths)
        if(ml > longest_month) longest_month = ml;
    const n_weeks = Math.ceil(1+longest_month/calendar.weekday_length);

    const month_display = by_id('cal-month-display');
    month_display.replaceChildren();
    month_display.onclick = function(e):void{
        let target = e.target as (HTMLElement | null);
        while(target && !target.classList.contains('cal-day-content'))
            target = target.parentElement;
        if(!target) return;
        e.stopPropagation();
        e.preventDefault();
        const d = get_dialog('multiline-text');
        // @ts-ignore
        const day = target.dataset['day']|0;
        const [year, month] = year_month();
        d.f.textarea.value = get_day(calendar, year, month, day);
        d.show_handler = function(){
            setTimeout(()=>{d.f.textarea.focus();}, 0);
        };
        d.ok_handler = function(){
            calendar.set_day(year, month, day, d.f.textarea.value);
            EMIT(FromClient.CALENDAR, [CalendarMsgType.EDITDAY, [[year, month, day, d.f.textarea.value]]]);
        };
        d.show();
    };
    calendar.set_day = function(year:number, month:number, day:number, txt:string):void{
        while(year > calendar.ending_year)
            calendar.add_year();
        set_day(calendar, year, month, day, txt);
        if(dv.active1 == year && dv.active2.get(year) == month)
            md_to_html(txt, (s:string):void=>{
                const first_day = first_day_of_month(calendar, year, month);
                contents[day+first_day].innerHTML = s;
            });
    };
    let s = '';
    for(let i = 0; i < calendar.weekday_length; i++)
        s += '1fr ';
    month_display.style.gridTemplateColumns = s;
    s = 'max-content';
    for(let i = 0; i < n_weeks; i++){
        s += ' 1fr';
    }
    month_display.style.gridTemplateRows = s;
    const contents:Array<HTMLDivElement> = [];
    const headers:Array<HTMLDivElement> = [];
    const day_els: Array<HTMLDivElement> = [];
    const n_days = n_weeks * calendar.weekday_length;
    for(let i = 0; i < calendar.weekday_length; i++){
        elem_parent_text(month_display, 'div', calendar.weekday_names[i], null, 'cal-weekday-name');
    }
    for(let i = 0; i < n_days; i++){
        const day = elem_with_parent(month_display, 'div', null, 'cal-day');
        const header = elem_with_parent(day, 'div', null, 'cal-day-header');
        header.textContent = ''+i;
        const content = elem_with_parent(day, 'div', null, 'cal-day-content');
        headers.push(header);
        contents.push(content);
        day_els.push(day);
    }
    const dv = make_dual_list_view<number, number>(year_selector, month_selector, ListViewFlags.NONE, ListViewFlags.NONE);

    dv.activate2_handler = function(y:number, m:number):void{
        const first_day = first_day_of_month(calendar, y, m);
        let i = 0;
        for(i = 0; i < first_day; i++){
            day_els[i].style.visibility = 'hidden';
            const header = headers[i];
            header.textContent = '';

            const content = contents[i];
            content.textContent = '';
            content.style.display = 'none';
        }
        const days = get_day_array(calendar, y, m);
        const mlen = month_len(calendar, y, m);
        for(;i < mlen+first_day; i++){
            const header = headers[i];
            header.textContent = `${i+1-first_day}`;

            const content = contents[i];
            const txt = days.length?days[i-first_day]:'';
            content.textContent = txt;
            if(txt.length) md_to_html(txt, (s:string)=>{content.innerHTML=s;});
            content.style.display = 'block';
            content.dataset['day'] = ''+(i-first_day);
            day_els[i].style.visibility = 'initial';
            day_els[i].style.display = 'grid';
        }
        for(;i < contents.length; i++){
            day_els[i].style.display = 'none';
        }
        store_local(StorageCategory.CALENDAR, 'year-month', [y, m]);
    };
    dv.activate1_handler = function(y:number):void{
        dv.make_active2(y, 0);
    };
    calendar.activate = function(year:number, month: number): void{
        w.show();
        dv.make_active2(year, month);
    };
    const nmonths = calendar.month_names.length;
    for(let y = calendar.starting_year; y <= calendar.ending_year; y++){
        dv.add_item1(`${y}`, y);
        for(let m = 0; m < nmonths; m++){
            const mn = calendar.month_names[m];
            dv.add_item2(mn, y, m);
        }
    }
    let [active_year, active_month] = get_local_default(StorageCategory.CALENDAR, 'year-month', [calendar.starting_year, 0]);
    if(active_year < calendar.starting_year) active_year = calendar.starting_year;
    if(active_year > calendar.ending_year) active_year = calendar.ending_year;
    if(active_month < 0) active_month = 0;
    if(active_month >= calendar.month_names.length) active_month = calendar.month_names.length-1;
    dv.make_active2(active_year, active_month);
    if(get_local(StorageCategory.WINDOW, openid)) w.show();
}

document.addEventListener('DOMContentLoaded', function(){
    const b = by_id('calendar-button');
    b.onclick = function(e){
        if(!_CALENDAR){
            const d = get_dialog('cal-dialog');
            if(!d) return;
            d.f['start-year'].value = '1460'
            d.f.gregorian.checked = true;
            d.f['start-day'].value = 'Mon';

            d.f['month0'].value = 'Jan';
            d.f['month0len'].value = '31';
            d.f['month1'].value = 'Feb';
            d.f['month1len'].value = '28';
            d.f['month2'].value = 'Mar';
            d.f['month2len'].value = '31';
            d.f['month3'].value = 'Apr';
            d.f['month3len'].value = '30';
            d.f['month4'].value = 'May';
            d.f['month4len'].value = '31';
            d.f['month5'].value = 'Jun';
            d.f['month5len'].value = '30';
            d.f['month6'].value = 'Jul';
            d.f['month6len'].value = '31';
            d.f['month7'].value = 'Aug';
            d.f['month7len'].value = '31';
            d.f['month8'].value = 'Sep';
            d.f['month8len'].value = '30';
            d.f['month9'].value = 'Oct';
            d.f['month9len'].value = '31';
            d.f['month10'].value = 'Nov';
            d.f['month10len'].value = '30';
            d.f['month11'].value = 'Dec';
            d.f['month11len'].value = '31';

            d.f['day0'].value = 'Sun';
            d.f['day1'].value = 'Mon';
            d.f['day2'].value = 'Tue';
            d.f['day3'].value = 'Wed';
            d.f['day4'].value = 'Thu';
            d.f['day5'].value = 'Fri';
            d.f['day6'].value = 'Sat';
            d.f['day7'].value = '';
            d.f['day8'].value = '';
            d.f['day9'].value = '';
            d.f['day10'].value = '';
            d.f['day11'].value = '';

            d.ok_handler = function(){
                const month_names:Array<string> = [];
                const month_lengths:Array<number> = [];
                const day_names: Array<string> = [];
                for(let i = 0; i < 12; i++){
                    // @ts-ignore
                    const name = d.f[`month${i}`].value.trim();
                    if(!name.length) break;
                    // @ts-ignore
                    let len = d.f[`month${i}len`].value | 0;
                    if(!len) len = 30;
                    month_names.push(name);
                    month_lengths.push(len);
                }
                for(let i = 0; i < 12; i++){
                    // @ts-ignore
                    const name = d.f[`day${i}`].value.trim();
                    if(!name.length) break;
                    day_names.push(name);
                }
                const flags = d.f.gregorian.checked?CalendarFlags.GREGORIAN:CalendarFlags.NONE;
                const msg: CalendarInitialize = [
                    CalendarMsgType.INITIALIZE,
                    // @ts-ignore
                    d.f['start-year'].value|0,
                    day_names.indexOf(d.f['start-day'].value),
                    month_names,
                    month_lengths,
                    day_names,
                    flags,
                    [],
                ];
                if(msg[2] < 0) msg[2] = 0;
                EMIT(FromClient.CALENDAR, msg);
            };

            d.show();
        }
        else {
            get_window('cal').show();
        }
    };
});

ONRECV(ToClient.CALENDAR, function(msg:CalendarMsg):void{
    switch(msg[0]){
        case CalendarMsgType.INITIALIZE:
            _CALENDAR = {
                starting_year: msg[1],
                starting_day_of_week: msg[2],
                month_names: msg[3],
                month_lengths: msg[4],
                weekday_names: msg[5],
                weekday_length: msg[5].length,
                flags: msg[6],
                years: new Map(),
                ending_year: msg[1],
                set_day: (_:number, __:number, ___:number, ____:string)=>{},
                add_year: ()=>{},
                activate: (_:number, __:number)=>{},
            };
            init_calendar(_CALENDAR, msg[7]);
            build_calendar_window(_CALENDAR);
            break;
        case CalendarMsgType.EDITDAY:
            for(const d of msg[1]){
                _CALENDAR.set_day(d[0], d[1], d[2], d[3]);
            }
            break;
        case CalendarMsgType.ADDYEAR:
            _CALENDAR.add_year();
            break;
        case CalendarMsgType.SHOW:
            _CALENDAR.activate(msg[1], msg[2]);
            break;
    }
});
