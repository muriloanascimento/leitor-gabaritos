// src/omr.js

const esperarOpenCV = () => new Promise(res => {
    const check = () => (window.cv && window.cv.Mat) ? res() : setTimeout(check, 100);
    check();
});

export const processarProvaProfissional = async (canvasOriginal) => {
    await esperarOpenCV();
    const cv = window.cv;

    // 1. Carregar imagem e converter para escala de cinza
    let src = cv.imread(canvasOriginal);
    let cinza = new cv.Mat();
    cv.cvtColor(src, cinza, cv.COLOR_RGBA2GRAY);

    // 2. Threshold (Transformar em Preto e Branco puro, invertido)
    // O THRESH_BINARY_INV transforma preto em branco (255) e branco em preto (0)
    let binaria = new cv.Mat();
    cv.threshold(cinza, binaria, 160, 255, cv.THRESH_BINARY_INV);

    // 3. DETECTAR ÂNCORAS (Quadrados nos cantos)
    let contornos = new cv.MatVector();
    let hierarquia = new cv.Mat();
    cv.findContours(binaria, contornos, hierarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let pontosAncoras = [];
    for (let i = 0; i < contornos.size(); ++i) {
        let cnt = contornos.get(i);
        let area = cv.contourArea(cnt);
        let rect = cv.boundingRect(cnt);
        let proporcao = rect.width / rect.height;

        // Filtra objetos que parecem quadrados pretos (âncoras)
        // Largura/altura próximos e área mínima de 300 pixels
        if (area > 300 && area < 5000 && proporcao > 0.75 && proporcao < 1.25) {
            pontosAncoras.push({ 
                x: rect.x + rect.width / 2, 
                y: rect.y + rect.height / 2,
                width: rect.width,
                height: rect.height
            });
        }
    }

    // Se não achou as 4 âncoras, retorna erro
    if (pontosAncoras.length < 4) {
        // Limpeza de memória
        src.delete(); cinza.delete(); binaria.delete(); contornos.delete(); hierarquia.delete();
        return {
            sucesso: false,
            mensagem: `Erro: Âncoras não encontradas (detectadas: ${pontosAncoras.length}/4). Verifique se a página está inteira.`,
            res: Array(52).fill("ERRO"),
            pontosDetectados: pontosAncoras,
            pontosFinais: []
        };
    }

    // 4. CORREÇÃO DE PERSPECTIVA (Garante que a folha fique reta)
    // Seleção robusta dos 4 cantos mais extremos
    let tl = pontosAncoras[0];
    let tr = pontosAncoras[0];
    let br = pontosAncoras[0];
    let bl = pontosAncoras[0];

    // Para encontrar os cantos de forma robusta no conjunto:
    // Top-Left (TL): minimiza x + y
    // Top-Right (TR): maximiza x - y
    // Bottom-Right (BR): maximiza x + y
    // Bottom-Left (BL): minimiza x - y
    let minSum = Infinity, maxSum = -Infinity;
    let minDiff = Infinity, maxDiff = -Infinity;

    for (let pt of pontosAncoras) {
        let sum = pt.x + pt.y;
        let diff = pt.x - pt.y;

        if (sum < minSum) { minSum = sum; tl = pt; }
        if (sum > maxSum) { maxSum = sum; br = pt; }
        if (diff > maxDiff) { maxDiff = diff; tr = pt; }
        if (diff < minDiff) { minDiff = diff; bl = pt; }
    }

    let pontosFinais = [tl, tr, br, bl];

    let ptsOrigem = cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.x, tl.y, 
        tr.x, tr.y, 
        br.x, br.y, 
        bl.x, bl.y
    ]);

    // Criar uma imagem virtual perfeitamente reta de 800x1100 pixels
    let larguraFinal = 800;
    let alturaFinal = 1100;
    let ptsDestino = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0, 
        larguraFinal, 0, 
        larguraFinal, alturaFinal, 
        0, alturaFinal
    ]);

    let M = cv.getPerspectiveTransform(ptsOrigem, ptsDestino);
    let reta = new cv.Mat();
    cv.warpPerspective(binaria, reta, M, new cv.Size(larguraFinal, alturaFinal));

    // 5. LEITURA DAS QUESTÕES (Agora com mira laser!)
    let resultados = [];
    
    // Coordenadas RELATIVAS à imagem de 800x1100
    const config = {
        colunasX: [115, 495], // Onde começam as colunas 1 e 2
        opcoesX: [0, 36, 72, 108, 144], // Distância A, B, C, D, E
        inicioY: 278,
        espacoY: 30.5,
        tamanhoBolha: 20
    };

    for (let col = 0; col < 2; col++) {
        for (let q = 0; q < 26; q++) {
            let marcadas = [];
            for (let opt = 0; opt < 5; opt++) {
                let x = config.colunasX[col] + config.opcoesX[opt];
                let y = config.inicioY + (q * config.espacoY);

                // Define a Região de Interesse (ROI) para ler os pixels da bolha
                let roi = reta.roi(new cv.Rect(x, y, config.tamanhoBolha, config.tamanhoBolha));
                let pixelsPretos = cv.countNonZero(roi);
                
                // Se mais de 25% da bolha estiver preenchida (com base no threshold invertido)
                if (pixelsPretos > (config.tamanhoBolha * config.tamanhoBolha * 0.25)) {
                    marcadas.push(["A", "B", "C", "D", "E"][opt]);
                }
                roi.delete();
            }

            if (marcadas.length === 1) resultados.push(marcadas[0]);
            else if (marcadas.length > 1) resultados.push("X"); // Resposta dupla/rasurada
            else resultados.push(""); // Em branco
        }
    }

    // Limpeza de memória
    src.delete(); cinza.delete(); binaria.delete(); contornos.delete(); 
    hierarquia.delete(); ptsOrigem.delete(); ptsDestino.delete(); M.delete(); reta.delete();

    return {
        sucesso: true,
        mensagem: "Processado com sucesso!",
        res: resultados,
        pontosDetectados: pontosAncoras,
        pontosFinais: pontosFinais
    };
};
