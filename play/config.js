// Culper configuration. This file is public; nothing in it is a secret.
//
// backend:
//   'local'    everything stays in this browser. Tabs of the same browser
//              share a room, which is enough to test a whole game on one
//              machine. Nothing leaves the device.
//   'firebase' the real thing: rooms sync across devices through a Firebase
//              Realtime Database. Create a free project, add a web app,
//              paste the config below, and set the rules in docs/firebase.md.
export default {
  backend: 'firebase',
  firebase: {
    apiKey: 'AIzaSyBB_thFu8SgP8rz3hbnHC38XwwJH6_gIMY',
    authDomain: 'culper-9a36f.firebaseapp.com',
    databaseURL: 'https://culper-9a36f-default-rtdb.firebaseio.com',
    projectId: 'culper-9a36f',
    appId: '1:341285622269:web:f042f5778c677840ab0994',
  },
  familyMax: 5,        // family-pack words mixed into a board, unmarked
  timerDefault: null,  // seconds per turn, null for no timer
  version: '0.1.0',
};
