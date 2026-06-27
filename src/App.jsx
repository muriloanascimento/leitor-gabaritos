// src/App.jsx
import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { processarProvaProfissional } from './omr';
import './App.css';
// Esta linha diz: "Busque o ajudante que combina exatamente com a minha versão atual"
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;


function App() {
  const [isCvReady, setCvReady] = useState(false);
  const [logs, setLogs] = useState([]);
  const [preview, setPreview] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [progresso, setProgresso] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setCvReady(true);
        clearInterval(timer);
        addLog("SISTEMA PRONTO: Inteligência Artificial carregada.");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    addLog("Iniciando processamento de 50 páginas...");
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Transformamos em Uint8Array e passamos dentro de um objeto { data: ... }
      const data = new Uint8Array(arrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: data }).promise;

      if (pdf.numPages !== 50) {
        addLog(`ERRO: O PDF tem ${pdf.numPages} páginas. O sistema exige 50.`);
        return;
      }

      const listaTemporaria = [];
      for (let i = 1; i <= 50; i++) {
        try {
          setProgresso(i);
          addLog(`Processando página ${i}...`);
          
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: ctx, viewport }).promise;

          const dados = await processarProvaProfissional(canvas, (url) => setPreview(url));
          listaTemporaria.push(dados);
          
          // Pausa curta para o navegador atualizar a tela
          await new Promise(r => setTimeout(r, 100));

        } catch (err) {
          addLog(`ERRO NA PÁGINA ${i}: ${err.message}`);
          listaTemporaria.push(Array(52).fill("ERRO"));
        }
      }
      setResultados(listaTemporaria);
      addLog("--- FIM DO PROCESSAMENTO ---");
    } catch (err) {
      addLog("ERRO CRÍTICO NO PDF: " + err.message);
    }
  };

  const exportar = () => {
    const cabecalho = Array.from({length: 52}, (_, i) => `Q${i+1}`);
    const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...resultados]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notas");
    XLSX.writeFile(wb, "Simulado_Saepe_Resultado.xlsx");
  };

  return (
    <div className="dashboard">
      <header>
        <h1>SIMULADO SAEPE GRE-MN</h1>
        <div className={`status-pill ${isCvReady ? 'ready' : ''}`}>
          {isCvReady ? 'OpenCV Pronto' : 'Carregando OpenCV...'}
        </div>
      </header>
      <div className="control-panel">
        <h3>1. Arquivo</h3>
        <div className="drop-zone" onClick={() => document.getElementById('f').click()}>
          {progresso > 0 ? `Processando: ${progresso}/50` : "Clique para selecionar o PDF"}
          <input type="file" id="f" hidden onChange={handleFile} accept=".pdf" />
        </div>
        <button className="export-button" onClick={exportar} disabled={resultados.length === 0}>
          Exportar Excel
        </button>
      </div>
      <div className="viewer-panel">
        <h3>2. Visualizador (Mira Laser)</h3>
        <div className="preview-box">
          {preview ? <img src={preview} alt="Scan" /> : "Aguardando primeira página..."}
        </div>
      </div>
      <div className="log-panel">
        <h3>3. Relatório de Operações</h3>
        <pre>{logs.join('\n')}</pre>
      </div>
    </div>
  );
}
export default App;