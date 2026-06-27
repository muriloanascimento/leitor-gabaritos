// src/App.jsx
import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { processarProvaProfissional } from './omr';
import './App.css';

// Configuração automática do ajudante (Worker) do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

function App() {
  const [isCvReady, setCvReady] = useState(false);
  const [logs, setLogs] = useState([]);
  const [preview, setPreview] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [progresso, setProgresso] = useState(0);

  // Monitora se o OpenCV carregou na memória do navegador
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

  // Função para adicionar mensagens no terminal da tela
  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    addLog("Iniciando processamento de 50 páginas...");
    try {
      // Carregamento robusto do PDF
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: data }).promise;

      // Validação da regra de negócio (Exatamente 50 páginas)
      if (pdf.numPages !== 50) {
        addLog(`ERRO: O PDF tem ${pdf.numPages} páginas. O sistema exige 50.`);
        return;
      }

      const listaTemporaria = [];

      // --- LOOP DE PROCESSAMENTO COM LIMPEZA DE MEMÓRIA ---
      for (let i = 1; i <= 50; i++) {
        try {
          setProgresso(i);
          addLog(`Processando página ${i}...`);
          
          const page = await pdf.getPage(i);
          // Scale 1.5 oferece um bom equilíbrio entre precisão OMR e uso de memória
          const viewport = page.getViewport({ scale: 1.5 }); 
          
          // Criamos um canvas temporário para a página atual
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          // Renderiza o PDF no Canvas
          await page.render({ canvasContext: ctx, viewport: viewport }).promise;

          // O Robô de Visão Computacional (omr.js) processa a imagem
          const dados = await processarProvaProfissional(canvas, (url) => setPreview(url));
          listaTemporaria.push(dados);
          
          // --- LIMPEZA DE MEMÓRIA (Liberando a RAM do navegador imediatamente) ---
          canvas.width = 0;
          canvas.height = 0;
          
          // Pausa curta de 100ms para permitir que o navegador atualize a interface (barra de progresso)
          await new Promise(r => setTimeout(r, 100));

        } catch (err) {
          addLog(`ERRO NA PÁGINA ${i}: ${err.message}`);
          listaTemporaria.push(Array(52).fill("ERRO"));
        }
      }

      setResultados(listaTemporaria);
      addLog("--- FIM DO PROCESSAMENTO ---");
      addLog("Clique no botão abaixo para baixar os resultados.");

    } catch (err) {
      addLog("ERRO CRÍTICO NO PDF: " + err.message);
    }
  };

  // Função para gerar o arquivo Excel com os resultados
  const exportar = () => {
    if (resultados.length === 0) return;
    
    addLog("Exportando planilha...");
    const cabecalho = Array.from({length: 52}, (_, i) => `Q${(i+1).toString().padStart(2, '0')}`);
    const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...resultados]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gabaritos");
    XLSX.writeFile(wb, "Simulado_SAEPE_Resultados.xlsx");
  };

  return (
    <div className="dashboard">
      <header>
        <h1>SIMULADO SAEPE GRE-MN</h1>
        <div className={`status-pill ${isCvReady ? 'ready' : ''}`}>
          {isCvReady ? 'OpenCV Pronto' : 'Carregando OpenCV...'}
        </div>
      </header>

      <div className="container-main" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* LADO ESQUERDO: CONTROLES */}
        <div className="control-panel">
          <h3>1. Seleção de Arquivo</h3>
          <div className="drop-zone" onClick={() => document.getElementById('f').click()}>
            {progresso > 0 ? `Progresso: ${progresso} / 50` : "Clique para selecionar o PDF de 50 páginas"}
            <input type="file" id="f" hidden onChange={handleFile} accept=".pdf" />
          </div>
          
          <button 
            className="export-button" 
            onClick={exportar} 
            disabled={resultados.length === 0}
            style={{ marginTop: '20px', width: '100%', padding: '15px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            EXPORTAR PARA EXCEL
          </button>
        </div>

        {/* LADO DIREITO: MIRA LASER (PREVIEW) */}
        <div className="viewer-panel">
          <h3>2. Visualizador de Alinhamento</h3>
          <div className="preview-box" style={{ background: '#000', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {preview ? <img src={preview} alt="Scan Preview" style={{ maxWidth: '100%' }} /> : "Aguardando processamento..."}
          </div>
        </div>

      </div>

      {/* RODAPÉ: TERMINAL DE LOGS */}
      <div className="log-panel" style={{ marginTop: '20px' }}>
        <h3>3. Relatório de Operações</h3>
        <pre style={{ background: '#000', color: '#0f0', padding: '15px', height: '150px', overflowY: 'auto', fontSize: '12px' }}>
          {logs.join('\n')}
        </pre>
      </div>
    </div>
  );
}

export default App;