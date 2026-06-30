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
    
    // Binarização adaptativa (ajusta conforme a iluminação do scanner)
    let binaria = new cv.Mat();
    cv.adaptiveThreshold(cinza, binaria, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 5);

    let contornos = new cv.MatVector();
    let hierarquia = new cv.Mat();
    cv.findContours(binaria, contornos, hierarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let pontosAncoras = [];
    for (let i = 0; i < contornos.size(); ++i) {
        let cnt = contornos.get(i);
        let rect = cv.boundingRect(cnt);
        // Busca os 4 quadrados pretos dos cantos
        if (rect.width > 25 && rect.width < 100 && Math.abs(rect.width - rect.height) < 15) {
            pontosAncoras.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }
    }

    let resultados = Array(52).fill("");
    let previewMat = new cv.Mat();
    cv.cvtColor(cinza, previewMat, cv.COLOR_GRAY2RGBA);

    if (pontosAncoras.length >= 4) {
        // 1. ALINHAMENTO GEOMÉTRICO
        pontosAncoras.sort((a, b) => a.y - b.y);
        let superior = pontosAncoras.slice(0, 2).sort((a, b) => a.x - b.x);
        let inferior = pontosAncoras.slice(pontosAncoras.length - 2).sort((a, b) => b.x - a.x);

        let ptsOrigem = cv.matFromArray(4, 1, cv.CV_32FC2, [
            superior[0].x, superior[0].y, superior[1].x, superior[1].y,
            inferior[0].x, inferior[0].y, inferior[1].x, inferior[1].y
        ]);
        let ptsDestino = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 1000, 0, 1000, 1414, 0, 1414]);
        let M = cv.getPerspectiveTransform(ptsOrigem, ptsDestino);
        let reta = new cv.Mat();
        cv.warpPerspective(binaria, reta, M, new cv.Size(1000, 1414));

        // 2. COORDENADAS CALCULADAS PARA O NOVO GABARITO
        const config = {
            colX: [136, 568],           // Início das bolinhas A (Col 1 e Col 2)
            stepX: 53.5,                // Espaço horizontal entre A->B->C->D...
            inicioY: 418,               // Início vertical da Questão 01 e 27
            stepY: 37.4,                // Espaço vertical entre linhas
            raioBusca: 14               // Olhamos apenas o "miolo" (14x14 pixels)
        };

        let finalMap = [];
        let corMira = new cv.Scalar(0, 255, 0, 255); // Verde para o preview

        for (let col = 0; col < 2; col++) {
            for (let q = 0; q < 26; q++) {
                let intensidades = [];
                for (let opt = 0; opt < 5; opt++) {
                    let x = Math.round(config.colX[col] + (opt * config.stepX));
                    let y = Math.round(config.inicioY + (q * config.stepY));
                    
                    // Medimos a "sujeira" (caneta) dentro da coordenada
                    let rect = new cv.Rect(x, y, config.raioBusca, config.raioBusca);
                    let roi = reta.roi(rect);
                    intensidades.push(cv.countNonZero(roi));
                    roi.delete();
                }

                // 3. LÓGICA ESTATÍSTICA (O MAIS ESCURO VENCE)
                let max = Math.max(...intensidades);
                let idxVencedor = intensidades.indexOf(max);
                let segundoMax = [...intensidades].sort((a,b) => b-a)[1];

                // Critério: Mínimo de 30 pixels e tem que ser 1.7x mais escuro que o resto
                if (max > 35 && max > (segundoMax * 1.7)) {
                    finalMap.push(["A", "B", "C", "D", "E"][idxVencedor]);
                } else if (max > 35) {
                    finalMap.push("X"); // Dubiedade/Rasura
                } else {
                    finalMap.push("");  // Branco
                }
            }
        }
        resultados = finalMap;
        ptsOrigem.delete(); ptsDestino.delete(); M.delete(); reta.delete();
    } else {
        resultados = Array(52).fill("ERRO_ANCORA");
    }

    // Gerar preview para o usuário ver
    const canvasTemp = document.createElement('canvas');
    cv.imshow(canvasTemp, previewMat);
    setPreview(canvasTemp.toDataURL());
    
    src.delete(); cinza.delete(); binaria.delete(); contornos.delete(); hierarquia.delete(); previewMat.delete();
    return resultados;
};
