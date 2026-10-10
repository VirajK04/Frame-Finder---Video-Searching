import { useState, useEffect, useRef, useMemo } from 'react'
import processVideoFile from './utils/frameExtractor'

function App() {
  const [status, setStatus] = useState('Initializing...')
  const [videoFile, setVideoFile] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  
  const workerRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    
    workerRef.current.onmessage = (e) => {
      const { type, message, results: searchResults } = e.data
      
      if (type === 'STATUS') {
        setStatus(message)
      } else if (type === 'SUCCESS') {
        console.log(message)
      } else if (type === 'ERROR') {
        console.error(message)
        setStatus(`Error: ${message}`)
      } else if (type === 'SEARCH_RESULTS') {
        setResults(searchResults)
        setStatus('Ready')
      }
    };

    workerRef.current.postMessage({ type: 'INIT' })

    return () => {
      workerRef.current.terminate()
    };
  }, [])

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setVideoFile(file)
    setStatus('Extracting and Indexing frames...')
    setResults([])

    try {
      await processVideoFile(file, (frameData) => {
        workerRef.current.postMessage(
          { type: 'INDEX_FRAME', payload: frameData },
          [frameData.imageBitmap]
        )
      })
      setStatus('Indexing complete. Ready for search.');
    } catch (error) {
      console.error(error);
      setStatus('Failed to process video.')
    }
  }

  const handleSearch = () => {
    if (!searchQuery.trim()) return
    setStatus('Searching...')
    workerRef.current.postMessage({ type: 'SEARCH', payload: { query: searchQuery } })
  }

  const handleResultClick = (timestamp) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp
      videoRef.current.play()
    }
  }

  const videoSrc = useMemo(() => {
    return videoFile ? URL.createObjectURL(videoFile) : ''
  }, [videoFile])

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Zero-Backend NLE Search</h1>
      
      <div style={{ padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '5px', marginBottom: '20px' }}>
        <strong>System Status:</strong> {status}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>1. Drop Video to Index</h3>
        <input type="file" accept="video/mp4,video/webm" onChange={handleFileUpload} />
      </div>

      {videoFile && (
        <div style={{ marginBottom: '20px' }}>
          <h3>2. Search Footage</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., 'a red car' or 'sunset'"
              style={{ flex: 1, padding: '8px' }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} style={{ padding: '8px 16px' }}>Search</button>
          </div>
        </div>
      )}

      {videoFile && (
        <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
          <div style={{ flex: 2 }}>
            <video 
              ref={videoRef} 
              src={videoSrc} 
              controls 
              style={{ width: '100%', borderRadius: '8px', backgroundColor: '#000' }} 
            />
          </div>
          
          <div style={{ flex: 1 }}>
            <h3>Matches</h3>
            {results.length === 0 ? (
              <p style={{ color: '#666' }}>No results yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {results.map((r, idx) => (
                  <li 
                    key={idx} 
                    onClick={() => handleResultClick(r.timestamp)}
                    style={{ 
                      padding: '10px', 
                      borderBottom: '1px solid #eee', 
                      cursor: 'pointer',
                      backgroundColor: idx === 0 ? '#f0f9ff' : 'transparent'
                    }}
                  >
                    <strong>{formatTime(r.timestamp)}</strong> 
                    <span style={{ fontSize: '0.8em', color: '#666', marginLeft: '10px' }}>
                      ({(r.score * 100).toFixed(1)}%)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default App;