import {Hono} from "hono";

const settingRoute = new Hono()
    .get('/all-setting', async (c) => {
        // todo
    })

export default settingRoute;