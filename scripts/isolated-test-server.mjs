import next from 'next';
import {createServer} from 'node:http';
const app=next({dev:false,dir:process.cwd(),hostname:'127.0.0.1'});
await app.prepare();
const server=createServer(app.getRequestHandler());
server.listen(0,'127.0.0.1',()=>console.log(`ISOLATED_PORT=${server.address().port}`));
