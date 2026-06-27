// src/omr.js
const esperarOpenCV = () => new Promise(res => {
    const check = () => (window.cv && window.cv.Mat) ? res() : setTimeout(check, 100);
    check();
});

export const processarProvaProfissional = async (canvasOriginal, setPreview) => {
    await esperarOpenCV();
    const cv = window.cv;

    let src = cv.imread(canvasOriginal);
    let cinza = new cv.Mat();
    cv.cvtColor(src, cinza, cv.COLOR_RGBA2GRAY);

    let binaria = new cv.Mat();
    // Ajuste de sensibilidade para o seu scan
    cv.threshold(cinza, binaria, 150, 255, cv.THRESH_BINARY_INV);

    let contornos = new cv.MatVector();
    let hierarquia = new cv.Mat();
    cv.findContours(binaria, contornos, hierarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let pontosAncoras = [];
    for (let i = 0; i < contornos.size(); ++i) {
        let cnt = contornos.get(i);
        let rect = cv.boundingRect(cnt);
        let area = rect.width * rect.height;
        let proporcao = rect.width / rect.height;

        // Filtro para os quadrados pretos das extremidades
        if (area > 300 && area < 5000 && proporcao > 0.8 && proporcao < 1.2) {
            pontosAncoras.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }
    }

    let resultados = Array(52).fill("");
    let previewMat = new cv.Mat();
    cv.cvtColor(cinza, previewMat, cv.COLOR_GRAY2RGBA);

    // Precisamos de pelo menos 4 âncoras para alinhar a folha
    if (pontosAncoras.length >= 4) {
        // Ordenar pontos para o alinhamento
        pontosAncoras.sort((a, b) => a.y - b.y);
        let superior = pontosAncoras.slice(0, 2).sort((a, b) => a.x - b.x);
        let inferior = pontosAncoras.slice(pontosAncoras.length - 2).sort((a, b) => b.x - a.x);

        let ptsOrigem = cv.matFromArray(4, 1, cv.CV_32FC2, [
            superior[0].x, superior[0].y,
            superior[1].x, superior[1].y,
            inferior[0].x, inferior[0].y,
            inferior[1].x, inferior[1].y
        ]);

        // Criamos uma folha virtual de 800x1100 (Proporção A4)
        let ptsDestino = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 800, 0, 800, 1100, 0, 1100]);
        let M = cv.getPerspectiveTransform(ptsOrigem, ptsDestino);
        let reta = new cv.Mat();
        
        // CORREÇÃO AQUI: Removi o "rta =" que causava o erro
        cv.warpPerspective(binaria, reta, M, new cv.Size(800, 1100));

        // MIRA DAS QUESTÕES (Ajustadas para o seu PDF)
        const config = {
            colunasX: [132, 512], // Início da coluna Português e Matemática
            opcoesX: [0, 42, 85, 128, 171], // Distância entre as bolhas A, B, C, D, E
            inicioY: 275, // Altura da questão 01
            espacoY: 30.2, // Distância vertical entre questões
            raioLeitura: 18 // Tamanho da área de conferência da bolha
        };

        let tempRes = [];
        for (let col = 0; col < 2; col++) {
            for (let q = 0; q < 26; q++) {
                let marcadas = [];
                for (let opt = 0; opt < 5; opt++) {
                    let x = config.colunasX[col] + config.opcoesX[opt];
                    let y = config.inicioY + (q * config.espacoY);

                    // Analisa a bolha
                    let rect = new cv.Rect(x, y, config.raioLeitura, config.raioLeitura);
                    let roi = reta.roi(rect);
                    let preenchimento = cv.countNonZero(roi);
                    
                    if (preenchimento > 160) { // Sensibilidade do grafite
                        marcadas.push(["A", "B", "C", "D", "E"][opt]);
                    }
                    roi.delete();
                }
                tempRes.push(marcadas.length === 1 ? marcadas[0] : (marcadas.length > 1 ? "X" : ""));
            }
        }
        resultados = tempRes;

        // Desenhar retângulo verde de confirmação no preview
        let verde = new cv.Scalar(0, 255, 0, 255);
        cv.line(previewMat, new cv.Point(superior[0].x, superior[0].y), new cv.Point(superior[1].x, superior[1].y), verde, 4);
        cv.line(previewMat, new cv.Point(inferior[0].x, inferior[0].y), new cv.Point(inferior[1].x, inferior[1].y), verde, 4);

        ptsOrigem.delete(); ptsDestino.delete(); M.delete(); reta.delete();
    } else {
        // Se falhar nas âncoras, mostra um alerta visual
        let vermelho = new cv.Scalar(255, 0, 0, 255);
        cv.putText(previewMat, "ERRO: ANCORAS NAO DETECTADAS", new cv.Point(50, 50), cv.FONT_HERSHEY_SIMPLEX, 1, vermelho, 2);
        resultados = Array(52).fill("ERRO_ANCORA");
    }

    // Criar a imagem de visualização para o Dashboard
    const canvasTemp = document.createElement('canvas');
    cv.imshow(canvasTemp, previewMat);
    setPreview(canvasTemp.toDataURL());

    // Limpeza de memória
    src.delete(); cinza.delete(); binaria.delete(); contornos.delete(); hierarquia.delete(); previewMat.delete();
    
    return resultados;
};