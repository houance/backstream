import {useEffect, useState} from 'react'
import './App.css'
import {client} from "./api/api.ts";

function App() {
    const [health, setHealth] = useState<string>('Not Healthy')

    useEffect(() => {
        const fetchData = async () => {
            // health
            const healthRes = await client.api.info.health.$get()
            const healthData = await healthRes.json()
            setHealth(healthData.message + healthRes.status)
        }
        fetchData()
    }, [])

    return (
        <div>
            <h1>NAS Backup Manager</h1>
            <div>Health: {health}</div>
        </div>
    )
}

export default App
