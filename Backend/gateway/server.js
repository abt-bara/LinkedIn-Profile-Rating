const express = require('express')
const app = express()

app.get('/',(req,res) => {
    res.send("Hello");
})

app.listen(["localhost:5173","localhost:5174","localhsot:4173"]);
