let socket = io();
let session_id = null;
socket.on('session-id', function(resp){
    session_id = resp;
});
//
// Messages that can be sent and received
// 
// Subsystem: chat
// ---------------
// * text
// * die roll
// * rich text
//
// Subsystem: map
// --------------
// * obj create
// * obj delete
// * obj move
// * obj sync
// * request undo
// * request redo
