import { useState, useEffect, useRef, useMemo } from 'react'
import processVideoFile from './utils/frameExtractor'

function App() {
  const [status, setStatus] = useState('Initializing...')
  const [videoFile, setVideoFile] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  
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
        setIsSearching(false)
      } else if (type === 'SEARCH_RESULTS') {
        setResults(searchResults)
        setStatus('Ready')
        setIsSearching(false)
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
  setStatus('Clearing old data and indexing...');
  setResults([])

  workerRef.current.postMessage({ type: 'CLEAR_DB' })

  try {
    await processVideoFile(file, (frameData) => {
      workerRef.current.postMessage(
        { type: 'INDEX_FRAME', payload: frameData },
        [frameData.imageBitmap]
      )
    })
    setStatus('Indexing complete. Ready for search.')
  } catch (error) {
    console.error(error)
    setStatus('Failed to process video.')
  }
};

  const handleSearch = () => {
    if (!searchQuery.trim()) return
    setStatus('Searching...')
    setIsSearching(true)
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
    <div style={{ 
      maxWidth: '850px', 
      margin: '0 auto', 
      padding: '40px 20px', 
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
      color: '#111827'
    }}>
      <h1 style={{ 
        textAlign: 'center', 
        fontSize: '2.5rem', 
        fontWeight: '800', 
        letterSpacing: '-0.025em',
        marginBottom: '40px' 
      }}>
        Zero-Backend NLE Search
      </h1>
      
      <div style={{ 
        padding: '12px 16px', 
        backgroundColor: '#f3f4f6', 
        borderRadius: '8px', 
        marginBottom: '32px',
        fontSize: '0.9rem',
        color: '#4b5563'
      }}>
        <strong style={{ color: '#111827' }}>System Status:</strong> {status}
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', fontWeight: '600' }}>1. Drop Video to Index</h3>
        <input 
          type="file" 
          accept="video/mp4,video/webm" 
          onChange={handleFileUpload} 
          style={{
            display: 'block',
            width: '100%',
            padding: '10px',
            border: '1px dashed #d1d5db',
            borderRadius: '8px',
            cursor: 'pointer',
            backgroundColor: '#fafafa'
          }}
        />
      </div>

      {videoFile && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', fontWeight: '600' }}>2. Search Footage</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., 'a red car' or 'sunset'"
              style={{ 
                flex: 1, 
                padding: '12px 16px',
                fontSize: '1rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                outline: 'none',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button 
              onClick={handleSearch} 
              disabled={isSearching}
              style={{ 
                padding: '12px 24px',
                fontSize: '1rem',
                fontWeight: '500',
                backgroundColor: isSearching ? '#4b5563' : '#111827',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: isSearching ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              Search
            </button>
          </div>
        </div>
      )}

      {videoFile && (
        <div style={{ display: 'flex', gap: '32px', marginTop: '20px' }}>
          <div style={{ flex: 2 }}>
            <video 
              ref={videoRef} 
              src={videoSrc} 
              controls 
              style={{ 
                width: '100%', 
                borderRadius: '12px', 
                backgroundColor: '#000',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
              }} 
            />
          </div>
          
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: '600' }}>Matches</h3>
              {isSearching && (
                <svg style={{ width: '24px', height: '24px', animation: 'spin 1s linear infinite' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="#e5e7eb" strokeWidth="4"></circle>
                  <path fill="#111827" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
            </div>
            
            <style>{`
              @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>

            {!isSearching && results.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>No results yet.</p>
            ) : !isSearching && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {results.map((r, idx) => (
                  <li 
                    key={idx} 
                    onClick={() => handleResultClick(r.timestamp)}
                    style={{ 
                      padding: '12px 16px', 
                      border: '1px solid #e5e7eb',
                      marginBottom: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: idx === 0 ? '#f3f4f6' : '#fff',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = idx === 0 ? '#f3f4f6' : '#fff'}
                  >
                    <strong style={{ fontSize: '1.1rem' }}>{formatTime(r.timestamp)}</strong> 
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