import {useEffect, useState} from 'react'
import './App.css'
import {client} from "./api/api.ts";

function App() {
    const [backups, setBackups] = useState<any[]>([])

    useEffect(() => {
        const fetchData = async () => {
            // client.backups.$get() is fully typed
            const res = await client.api.backups.$get()
            const data = await res.json()
            setBackups(data.jobs)
        }
        fetchData()
    }, [])

    return (
        <div>
            <h1>NAS Backup Manager</h1>
            {backups.map(job => <div key={job.id}>{job.tool}: {job.status}</div>)}
        </div>
    )
}

export default App
