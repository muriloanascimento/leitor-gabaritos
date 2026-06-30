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
    
    // Threshold binário simples - ideal para papel branco e marca preta
    let binaria = new cv.Mat();
    cv.threshold(cinza, binaria, 150, 255, cv.THRESH_BINARY_INV);

    let contornos = new cv.MatVector();
    let hierarquia = new cv.Mat();
    cv.findContours(binaria, contornos, hierarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let candidatos = [];
    for (let i = 0; i < contornos.size(); ++i) {
        let cnt = contornos.get(i);
        let rect = cv.boundingRect(cnt);
        let area = rect.width * rect.height;
        let proporcao = rect.width / rect.height;

        // NOVO FILTRO: Limites expandidos para 300 DPI (Área entre 1.000 e 50.000)
        if (area > 1000 && area < 50000 && proporcao > 0.6 && proporcao < 1.4) {
            candidatos.push({
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
                w: rect.width,
                h: rect.height
            });
        }
    }

    let resultados = Array(52).fill("");
    let previewMat = src.clone(); // Usamos o original para o preview ficar bonito

    // Se temos pelo menos 4 candidatos, vamos pegar os que estão mais nos cantos
    if (candidatos.length >= 4) {
        // Encontrar as 4 extremidades reais
        let tl = candidatos.reduce((p, c) => (c.x + c.y < p.x + p.y) ? c : p);
        let tr = candidatos.reduce((p, c) => (c.x - c.y > p.x - p.y) ? c : p);
        let bl = candidatos.reduce((p, c) => (c.x - c.y < p.x - p.y) ? c : p);
        let br = candidatos.reduce((p, c) => (c.x + c.y > p.x + p.y) ? c : p);

        let ptsOrigem = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, br.x, br.y]);
        let ptsDestino = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 1000, 0, 0, 1414, 1000, 1414]);
        
        let M = cv.getPerspectiveTransform(ptsOrigem, ptsDestino);
        let reta = new cv.Mat();
        cv.warpPerspective(binaria, reta, M, new cv.Size(1000, 1414));

        // COORDENADAS PARA O SEU GABARITO (Normalizado 1000x1414)
        const config = {
            colX: [136, 568],           
            stepX: 53.5,                
            inicioY: 418,               
            stepY: 37.4,                
            raio: 15               
        };

        let finalMap = [];
        let corVerde = new cv.Scalar(0, 255, 0, 255); 

        for (let col = 0; col < 2; col++) {
            for (let q = 0; q < 26; q++) {
                let intensidades = [];
                for (let opt = 0; opt < 5; opt++) {
                    let x = Math.round(config.colX[col] + (opt * config.stepX));
                    let y = Math.round(config.inicioY + (q * config.stepY));
                    
                    let rect = new cv.Rect(x, y, config.raio, config.raio);
                    let roi = reta.roi(rect);
                    intensidades.push(cv.countNonZero(roi));
                    roi.delete();
                }

                let max = Math.max(...intensidades);
                let idxVencedor = intensidades.indexOf(max);
                let segundoMax = [...intensidades].sort((a,b) => b-a)[1];

                // Lógica de decisão: Se a bolinha tem marcação clara comparada às outras
                if (max > 40 && max > (segundoMax * 1.6)) {
                    finalMap.push(["A", "B", "C", "D", "E"][idxVencedor]);
                } else if (max > 40) {
                    finalMap.push("X");
                } else {
                    finalMap.push("");
                }
            }
        }
        resultados = finalMap;

        // Desenhar as âncoras detectadas para você conferir na tela
        cv.rectangle(previewMat, new cv.Point(tl.x - tl.w/2, tl.y - tl.h/2), new cv.Point(tl.x + tl.w/2, tl.y + tl.h/2), corVerde, 5);
        cv.rectangle(previewMat, new cv.Point(tr.x - tr.w/2, tr.y - tr.h/2), new cv.Point(tr.x + tr.w/2, tr.y + tr.h/2), corVerde, 5);
        cv.rectangle(previewMat, new cv.Point(bl.x - bl.w/2, bl.y - bl.h/2), new cv.Point(bl.x + bl.w/2, bl.y + bl.h/2), corVerde, 5);
        cv.rectangle(previewMat, new cv.Point(br.x - br.w/2, br.y - br.h/2), new cv.Point(br.x + br.w/2, br.y + br.h/2), corVerde, 5);

        ptsOrigem.delete(); ptsDestino.delete(); M.delete(); reta.delete();
    } else {
        // Se não achou, vamos desenhar o que ele achou em vermelho para debug
        let corVermelha = new cv.Scalar(255, 0, 0, 255);
        candidatos.forEach(c => {
            cv.circle(previewMat, new cv.Point(c.x, c.y), 20, corVermelha, 2);
        });
        resultados = Array(52).fill("ERRO_ANCORA");
    }

    const canvasTemp = document.createElement('canvas');
    cv.imshow(canvasTemp, previewMat);
    setPreview(canvasTemp.toDataURL());
    
    src.delete(); cinza.delete(); binaria.delete(); contornos.delete(); hierarquia.delete(); previewMat.delete();
    return resultados;
};
