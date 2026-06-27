// src/App.jsx
import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { processarProvaProfissional } from './omr'; // Nosso robô de alinhamento
import './App.css'; // O visual do painel

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

function App() {
  const [isCvReady, setCvReady] = useState(false); // Estado: O robô acordou?
  const [logs, setLogs] = useState([]);
  const [preview, setPreview] = useState(null);
  const [resultados, setResultados] = useState([]);

  // <<-- A MÁGICA ESTÁ AQUI -->>
  // Este código fica rodando a cada segundo procurando pelo OpenCV
  useEffect(() => {
    const checkCv = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setCvReady(true);
        log("OpenCV.js carregado com sucesso. Sistema pronto.");
        clearInterval(checkCv);
      }
    }, 1000);
    return () => clearInterval(checkCv); // Limpa ao sair
  }, []);

  const log = (message) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    log("Arquivo PDF selecionado. Iniciando leitura...");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

    if (pdf.numPages !== 50) {
      log(`ERRO: PDF inválido. Encontradas ${pdf.numPages} páginas, mas são necessárias 50.`);
      return;
    }

    log("PDF validado. Processando 50 páginas...");
    let todasRespostas = [];
    for (let i = 1; i <= 50; i++) {
      log(`Lendo página ${i}...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Chama o robô para alinhar e ler
      const dados = await processarProvaProfissional(canvas, (imgUrl) => setPreview(imgUrl));
      todasRespostas.push(dados);
    }
    setResultados(todasRespostas);
    log("Processamento concluído. Planilha pronta para exportação.");
  };

  const exportar = () => {
    if(resultados.length === 0) return log("ERRO: Nenhum resultado para exportar.");
    log("Gerando arquivo Excel...");
    const cabecalho = Array.from({length: 52}, (_, i) => `Q${i+1}`);
    const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...resultados]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gabaritos");
    XLSX.writeFile(wb, "Resultados_Corrigidos.xlsx");
  };

  return (
    <div className="dashboard">
      <header>
        <h1>SIMULADO SAEPE GRE-MN</h1>
        <div className={`status-pill ${isCvReady ? 'ready' : ''}`}>
          {isCvReady ? 'OpenCV Pronto' : 'OpenCV Carregando...'}
        </div>
      </header>
      <main>
        <div className="control-panel">
          <h3>Painel de Controle</h3>
          <div className="drop-zone" onClick={() => document.getElementById('file-input').click()}>
            {!isCvReady ? "Aguardando inicialização..." : "Clique ou arraste o PDF aqui"}
            <input type="file" id="file-input" hidden onChange={handleFile} disabled={!isCvReady} />
          </div>
          <button className="export-button" onClick={exportar} disabled={resultados.length === 0}>Exportar para Excel</button>
        </div>
        <div className="viewer-panel">
          <h3>Visualizador de Alinhamento</h3>
          <div className="preview-box">
            {preview ? <img src={preview} alt="Pré-visualização do alinhamento" /> : "A pré-visualização aparecerá aqui"}
          </div>
        </div>
        <div className="log-panel">
          <h3>Logs de Processamento</h3>
          <pre>{logs.join('\n')}</pre>
        </div>
      </main>
    </div>
  );
}

export default App;