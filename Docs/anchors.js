document.addEventListener('DOMContentLoaded', function(){
    const h2s = Array.from(document.getElementsByTagName('h2'));
    const h3s = Array.from(document.getElementsByTagName('h3'));
    function add_clicker(elem){
        elem.onclick = function(){
            location.hash = '#' + elem.id;
        }
    }
    for(let h of h2s)
        add_clicker(h);
    for(let h of h3s){
        add_clicker(h);
    }
});
