// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { processarProvaProfissional } from './omr';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './App.css';

// Configura o worker do PDFJS localmente utilizando o asset do Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function App() {
  const [opencvStatus, setOpencvStatus] = useState("carregando");
  const [status, setStatus] = useState("Aguardando carregamento do OpenCV...");
  const [progresso, setProgresso] = useState(0);
  const [resFinal, setResFinal] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errosContagem, setErrosContagem] = useState(0);
  
  const canvasRef = useRef(null);
  const terminalEndRef = useRef(null);

  // Efeito para verificar se o OpenCV.js foi carregado no window
  useEffect(() => {
    let interval;
    const verificarOpenCV = () => {
      if (window.cv && window.cv.Mat) {
        setOpencvStatus("pronto");
        setStatus("OpenCV.js carregado com sucesso. Pronto para ler gabaritos!");
        adicionarLog("Sistema pronto. Insira um arquivo PDF de 50 páginas.");
        clearInterval(interval);
      }
    };
    
    // Roda verificação inicial
    verificarOpenCV();
    
    // Se não estiver pronto, verifica a cada 100ms
    if (!window.cv) {
      interval = setInterval(verificarOpenCV, 100);
    }
    
    return () => clearInterval(interval);
  }, []);

  // Faz rolagem automática do console de logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const adicionarLog = (mensagem) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [...prev, `[${timestamp}] ${mensagem}`]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (isProcessing || opencvStatus !== "pronto") return;
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      processarPDF(file);
    } else {
      alert("Por favor, arraste um arquivo PDF válido.");
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      processarPDF(file);
    }
  };

  const desenharDepuracao = (canvas, resOMR) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (resOMR.sucesso && resOMR.pontosFinais && resOMR.pontosFinais.length === 4) {
      // 1. Desenha contorno verde conectando os 4 cantos
      ctx.strokeStyle = '#10b981'; // Verde Neon
      ctx.lineWidth = 6;
      ctx.beginPath();
      const [tl, tr, br, bl] = resOMR.pontosFinais;
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.stroke();

      // 2. Desenha círculos verdes em cada âncora com o número correspondente
      resOMR.pontosFinais.forEach((pt, index) => {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 16, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(index + 1, pt.x, pt.y);
      });
    } else {
      // Desenha círculos vermelhos nos pontos detectados como alerta de erro
      if (resOMR.pontosDetectados) {
        resOMR.pontosDetectados.forEach((pt) => {
          ctx.fillStyle = '#ef4444'; // Vermelho Neon
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 14, 0, 2 * Math.PI);
          ctx.fill();
        });
      }
    }
  };

  const processarPDF = async (file) => {
    setIsProcessing(true);
    setResFinal([]);
    setProgresso(0);
    setErrosContagem(0);
    setLogs([]);
    adicionarLog(`Carregando PDF: ${file.name}...`);
    setStatus("Carregando documento...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

      if (pdf.numPages !== 50) {
        adicionarLog(`ERRO: PDF contém ${pdf.numPages} páginas, mas são necessárias exatamente 50.`);
        setStatus("Erro no arquivo enviado.");
        alert("ERRO: O PDF precisa ter EXATAMENTE 50 páginas!");
        setIsProcessing(false);
        return;
      }

      adicionarLog(`PDF carregado. Iniciando leitura das 50 provas.`);
      const todasRespostas = [];
      let erros = 0;

      for (let i = 1; i <= 50; i++) {
        setStatus(`Processando Prova ${i} de 50...`);
        setProgresso(i);
        adicionarLog(`Lendo página ${i}...`);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // Escala 2.0 melhora detecção pelo OpenCV
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Renderiza página do PDF no canvas visível
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Processa o OMR usando OpenCV.js
        const resultado = await processarProvaProfissional(canvas);
        
        // Desenha os pontos de depuração sobre o canvas
        desenharDepuracao(canvas, resultado);
        
        if (resultado.sucesso) {
          todasRespostas.push(resultado.res);
          const detectMsg = `Prova ${i} alinhada. Âncoras: 1(${Math.round(resultado.pontosFinais[0].x)},${Math.round(resultado.pontosFinais[0].y)}) ` +
            `2(${Math.round(resultado.pontosFinais[1].x)},${Math.round(resultado.pontosFinais[1].y)}) ` +
            `3(${Math.round(resultado.pontosFinais[2].x)},${Math.round(resultado.pontosFinais[2].y)}) ` +
            `4(${Math.round(resultado.pontosFinais[3].x)},${Math.round(resultado.pontosFinais[3].y)})`;
          adicionarLog(`${detectMsg} -> Sucesso.`);
        } else {
          todasRespostas.push(resultado.res);
          erros++;
          setErrosContagem(erros);
          adicionarLog(`Prova ${i}: ${resultado.mensagem}`);
        }
        
        // Pequena pausa para animação suave da UI
        await new Promise(r => setTimeout(r, 100));
      }

      setResFinal(todasRespostas);
      adicionarLog(`Processamento concluído. Sucessos: ${50 - erros}, Erros: ${erros}`);
      setStatus(erros > 0 
        ? `Leitura concluída com ${erros} erro(s). Veja o relatório abaixo.`
        : "Leitura concluída com 100% de sucesso!"
      );
    } catch (err) {
      console.error(err);
      adicionarLog(`ERRO CRÍTICO ao processar PDF: ${err.message}`);
      setStatus("Ocorreu um erro no processamento do arquivo.");
    } finally {
      setIsProcessing(false);
    }
  };

  const exportarExcel = () => {
    if (resFinal.length === 0) return;
    adicionarLog("Gerando arquivo Excel...");
    
    // Cabeçalho personalizado com coluna para Identificação da Prova
    const cabecalho = ["Prova/Aluno", ...Array.from({ length: 52 }, (_, i) => `Q${i + 1}`)];
    
    // Formata os dados no formato adequado para SheetJS
    const dadosSheet = resFinal.map((linha, index) => {
      // Se a linha tem a marca de erro, indica erro de leitura na primeira célula
      const identificacao = `Aluno/Prova ${index + 1}`;
      const eErro = linha.includes("ERRO");
      return [
        identificacao, 
        ...(eErro ? Array(52).fill("ERRO DE LEITURA") : linha)
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...dadosSheet]);
    
    // Estilos básicos de tamanho de coluna
    const larguraColunas = [{ wch: 15 }, ...Array(52).fill({ wch: 5 })];
    ws['!cols'] = larguraColunas;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gabaritos");
    XLSX.writeFile(wb, "Simulado_Saepe_Resultados.xlsx");
    adicionarLog("Excel exportado: 'Simulado_Saepe_Resultados.xlsx'.");
  };

  const reiniciar = () => {
    setProgresso(0);
    setResFinal([]);
    setErrosContagem(0);
    setLogs([]);
    setStatus("Pronto para receber novo PDF.");
    adicionarLog("Painel reiniciado. Aguardando novo PDF.");
    
    // Limpa o canvas de visualização
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Header Premium */}
      <header className="dashboard-header">
        <div className="header-brand">
          <div className="logo-sparkle">✦</div>
          <div>
            <h1>SIMULADO SAEPE GRE-MN</h1>
            <p className="subtitle">Mecanismo de Reconhecimento Óptico de Marcas (OMR)</p>
          </div>
        </div>
        
        {/* Status do OpenCV.js */}
        <div className={`status-badge ${opencvStatus}`}>
          <span className="pulse-dot"></span>
          {opencvStatus === "pronto" ? "OpenCV.js Ativo" : "OpenCV.js Carregando"}
        </div>
      </header>

      {/* Grid Principal */}
      <main className="dashboard-grid">
        
        {/* Coluna Esquerda: Controles, Progresso e Console de Logs */}
        <section className="dashboard-card control-panel">
          <div className="card-header">
            <h3>Painel de Controle</h3>
          </div>
          
          {/* Upload Area */}
          <div 
            className={`upload-zone ${isProcessing ? 'disabled' : ''} ${opencvStatus !== 'pronto' ? 'locked' : ''}`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => {
              if (!isProcessing && opencvStatus === 'pronto') {
                document.getElementById('pdf-upload-input').click();
              }
            }}
          >
            <input 
              type="file" 
              accept=".pdf" 
              onChange={handleFileSelect} 
              id="pdf-upload-input" 
              hidden 
              disabled={isProcessing || opencvStatus !== 'pronto'}
            />
            
            <div className="upload-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            
            {opencvStatus !== 'pronto' ? (
              <p className="upload-text">Aguardando inicialização do OpenCV...</p>
            ) : isProcessing ? (
              <p className="upload-text text-active">Processando provas ativamente...</p>
            ) : (
              <>
                <p className="upload-text">Arraste o arquivo PDF aqui</p>
                <p className="upload-subtext">Ou clique para navegar pelo computador (EXATAMENTE 50 PÁGINAS)</p>
              </>
            )}
          </div>

          {/* Estado de Progresso e Métricas */}
          {progresso > 0 && (
            <div className="progress-section">
              <div className="progress-info">
                <span>Leitura das Provas</span>
                <span className="progress-counter">{progresso} / 50</span>
              </div>
              <div className="progress-track-wrapper">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${(progresso / 50) * 100}%` }}
                ></div>
              </div>
              
              <div className="metrics-summary">
                <div className="metric-box">
                  <div className="metric-val">{50 - errosContagem}</div>
                  <div className="metric-lbl">Alinhadas</div>
                </div>
                <div className="metric-box warning">
                  <div className="metric-val">{errosContagem}</div>
                  <div className="metric-lbl">Erros</div>
                </div>
              </div>
            </div>
          )}

          {/* Console de Logs Estilo Terminal */}
          <div className="console-wrapper">
            <div className="console-header">
              <span className="console-dot red"></span>
              <span className="console-dot yellow"></span>
              <span className="console-dot green"></span>
              <span className="console-title">LOGS DE PROCESSAMENTO</span>
            </div>
            <div className="console-body">
              {logs.map((log, index) => (
                <div key={index} className="console-line">{log}</div>
              ))}
              <div ref={terminalEndRef}></div>
            </div>
          </div>
        </section>

        {/* Coluna Direita: Monitor e Depurador de Imagem */}
        <section className="dashboard-card monitor-panel">
          <div className="card-header">
            <h3>Visualizador de Alinhamento e Mira Laser</h3>
            <span className="card-badge">Feedback do OpenCV.js</span>
          </div>
          
          <div className="monitor-container">
            <div className="canvas-wrapper">
              <canvas ref={canvasRef} />
              
              {progresso === 0 && (
                <div className="canvas-placeholder">
                  <div className="placeholder-content">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="placeholder-icon">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p>O monitor exibirá o escaneamento da folha e a detecção das 4 âncoras em tempo real.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="status-banner">
              <span className="status-label">Status atual:</span>
              <span className="status-desc">{status}</span>
            </div>
          </div>
        </section>
      </main>

      {/* Painel de Resultados e Pré-Visualização de Dados */}
      {resFinal.length > 0 && (
        <section className="dashboard-card results-section">
          <div className="results-header">
            <div>
              <h3>Visualização de Resultados</h3>
              <p className="results-subtitle">Gabaritos computados. Confirme os dados antes de gerar o Excel.</p>
            </div>
            
            <div className="action-buttons">
              <button className="btn btn-secondary" onClick={reiniciar} disabled={isProcessing}>
                REINICIAR LEITOR
              </button>
              <button className="btn btn-primary" onClick={exportarExcel} disabled={isProcessing}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="btn-icon">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                EXPORTAR EXCEL
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Aluno/Prova</th>
                  <th>Status OMR</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                  <th>Q4</th>
                  <th>Q5</th>
                  <th>Q6</th>
                  <th>Q7</th>
                  <th>Q8</th>
                  <th>Q9</th>
                  <th>Q10</th>
                  <th>Outras...</th>
                </tr>
              </thead>
              <tbody>
                {resFinal.map((linha, index) => {
                  const eErro = linha.includes("ERRO");
                  return (
                    <tr key={index} className={eErro ? 'row-error' : ''}>
                      <td><strong>Prova {index + 1}</strong></td>
                      <td>
                        <span className={`pill ${eErro ? 'pill-danger' : 'pill-success'}`}>
                          {eErro ? 'Falha na Âncora' : 'Leitura OK'}
                        </span>
                      </td>
                      {eErro ? (
                        <td colSpan={11} className="text-center text-danger">
                          Não foi possível alinhar a página para esta prova. Verifique as bordas do papel.
                        </td>
                      ) : (
                        <>
                          {linha.slice(0, 10).map((ans, qIdx) => (
                            <td key={qIdx} className={`ans-cell ${ans === 'X' ? 'double-ans' : ans === '' ? 'empty-ans' : ''}`}>
                              {ans || '—'}
                            </td>
                          ))}
                          <td>
                            <span className="text-muted">+{linha.length - 10} questões</span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
