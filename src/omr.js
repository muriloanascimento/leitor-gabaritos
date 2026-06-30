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
    
    // Binarização mais agressiva para limpar sombras do scanner
    let binaria = new cv.Mat();
    cv.threshold(cinza, binaria, 120, 255, cv.THRESH_BINARY_INV);

    let contornos = new cv.MatVector();
    let hierarquia = new cv.Mat();
    cv.findContours(binaria, contornos, hierarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let candidatos = [];
    for (let i = 0; i < contornos.size(); ++i) {
        let cnt = contornos.get(i);
        let rect = cv.boundingRect(cnt);
        let area = rect.width * rect.height;
        let proporcao = rect.width / rect.height;

        // Filtro mais amplo para detectar as âncoras da HP (quadrados grandes)
        if (area > 300 && area < 10000 && proporcao > 0.7 && proporcao < 1.3) {
            candidatos.push({
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
                area: area
            });
        }
    }

    let resultados = Array(52).fill("");
    let previewMat = new cv.Mat();
    cv.cvtColor(cinza, previewMat, cv.COLOR_GRAY2RGBA);

    // LÓGICA INTELIGENTE: Pegar os 4 pontos mais extremos (os cantos reais)
    if (candidatos.length >= 4) {
        // Encontrar os 4 cantos baseado na distância das extremidades
        let tl = candidatos.reduce((prev, curr) => (curr.x + curr.y < prev.x + prev.y) ? curr : prev);
        let tr = candidatos.reduce((prev, curr) => (curr.x - curr.y > prev.x - prev.y) ? curr : prev);
        let bl = candidatos.reduce((prev, curr) => (curr.x - curr.y < prev.x - prev.y) ? curr : prev);
        let br = candidatos.reduce((prev, curr) => (curr.x + curr.y > prev.x + prev.y) ? curr : prev);

        let ptsOrigem = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, br.x, br.y]);
        let ptsDestino = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 1000, 0, 0, 1414, 1000, 1414]);
        
        let M = cv.getPerspectiveTransform(ptsOrigem, ptsDestino);
        let reta = new cv.Mat();
        cv.warpPerspective(binaria, reta, M, new cv.Size(1000, 1414));

        // COORDENADAS AJUSTADAS PARA O SEU SCAN REAL (HP 300 DPI)
        const config = {
            colX: [134, 566],           
            stepX: 53.6,                
            inicioY: 416,               
            stepY: 37.3,                
            raioBusca: 15               
        };

        let finalMap = [];
        let corMira = new cv.Scalar(0, 255, 0, 255); 
        let miraSeta = new cv.Mat.zeros(1414, 1000, cv.CV_8UC4);

        for (let col = 0; col < 2; col++) {
            for (let q = 0; q < 26; q++) {
                let intensidades = [];
                for (let opt = 0; opt < 5; opt++) {
                    let x = Math.round(config.colX[col] + (opt * config.stepX));
                    let y = Math.round(config.inicioY + (q * config.stepY));
                    
                    // Desenha a mira para debug
                    cv.rectangle(miraSeta, new cv.Point(x, y), new cv.Point(x + config.raioBusca, y + config.raioBusca), corMira, 1);

                    let rect = new cv.Rect(x, y, config.raioBusca, config.raioBusca);
                    let roi = reta.roi(rect);
                    intensidades.push(cv.countNonZero(roi));
                    roi.delete();
                }

                let max = Math.max(...intensidades);
                let idxVencedor = intensidades.indexOf(max);
                let segundoMax = [...intensidades].sort((a,b) => b-a)[1];

                if (max > 45 && max > (segundoMax * 1.6)) {
                    finalMap.push(["A", "B", "C", "D", "E"][idxVencedor]);
                } else if (max > 45) {
                    finalMap.push("X");
                } else {
                    finalMap.push("");
                }
            }
        }
        resultados = finalMap;

        // Visualização da correção no Preview
        let M_inv = cv.getPerspectiveTransform(ptsDestino, ptsOrigem);
        let miraOriginal = new cv.Mat();
        cv.warpPerspective(miraSeta, miraOriginal, M_inv, new cv.Size(src.cols, src.rows));
        cv.add(previewMat, miraOriginal, previewMat);

        ptsOrigem.delete(); ptsDestino.delete(); M.delete(); reta.delete(); miraSeta.delete(); miraOriginal.delete(); M_inv.delete();
    } else {
        resultados = Array(52).fill("ERRO_ANCORA");
    }

    const canvasTemp = document.createElement('canvas');
    cv.imshow(canvasTemp, previewMat);
    setPreview(canvasTemp.toDataURL());
    
    src.delete(); cinza.delete(); binaria.delete(); contornos.delete(); hierarquia.delete(); previewMat.delete();
    return resultados;
};
