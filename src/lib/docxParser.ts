import mammoth from 'mammoth';
import JSZip from 'jszip';
import omml2mathml from 'omml2mathml';
import { QuizQuestionP1, QuizQuestionP2, QuizQuestionP3 } from '../types';

async function preprocessDocxArrayBuffer(arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return arrayBuffer;

    const docXmlStr = await docFile.async('string');
    if (!docXmlStr) return arrayBuffer;

    // Load relationships if present
    const relsFile = zip.file('word/_rels/document.xml.rels');
    const relMap: Record<string, string> = {};
    if (relsFile) {
      const relsXmlStr = await relsFile.async('string');
      const relsDoc = new DOMParser().parseFromString(relsXmlStr, 'text/xml');
      const relNodes = relsDoc.getElementsByTagName('Relationship');
      for (let i = 0; i < relNodes.length; i++) {
        const id = relNodes[i].getAttribute('Id');
        const target = relNodes[i].getAttribute('Target');
        if (id && target) {
          relMap[id] = target;
        }
      }
    }

    const xmlDoc = new DOMParser().parseFromString(docXmlStr, 'text/xml');
    let modified = false;

    // Helper to serialize MathML DOM node to string
    const serializeNode = (node: Node): string => {
      if (!node) return '';
      if (node.nodeType === 3) return node.nodeValue || '';
      const tagName = node.nodeName.toLowerCase();
      let attrs = '';
      if ((node as Element).attributes) {
        const elementAttrs = (node as Element).attributes;
        for (let i = 0; i < elementAttrs.length; i++) {
          const attr = elementAttrs[i];
          attrs += ` ${attr.name}="${attr.value}"`;
        }
      }
      let children = '';
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          children += serializeNode(node.childNodes[i]);
        }
      }
      return `<${tagName}${attrs}>${children}</${tagName}>`;
    };

    // 1. Process Office MathML (OMML: m:oMath / m:oMathPara)
    const allXmlElements = Array.from(xmlDoc.getElementsByTagName('*'));
    const oMathList = allXmlElements.filter((el) => el.localName === 'oMath');

    for (const mathEl of oMathList) {
      try {
        const mathmlNode = omml2mathml(mathEl);
        if (mathmlNode) {
          let mathmlStr = serializeNode(mathmlNode);
          // Fix mroot with empty degree to msqrt
          mathmlStr = mathmlStr.replace(/<mroot>([\s\S]*?)<mrow>\s*<\/mrow><\/mroot>/g, '<msqrt>$1</msqrt>');

          if (!mathmlStr.includes('xmlns=')) {
            mathmlStr = mathmlStr.replace('<math', '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"');
          } else if (!mathmlStr.includes('display=')) {
            mathmlStr = mathmlStr.replace('<math', '<math display="inline"');
          }

          const newR = xmlDoc.createElement('w:r');
          const newT = xmlDoc.createElement('w:t');
          newT.setAttribute('xml:space', 'preserve');
          newT.textContent = `___MATHML_START___${mathmlStr}___MATHML_END___`;
          newR.appendChild(newT);

          const parentPara = mathEl.closest ? mathEl.closest('oMathPara') : null;
          if (parentPara && parentPara.parentNode) {
            parentPara.parentNode.replaceChild(newR, parentPara);
          } else if (mathEl.parentNode) {
            mathEl.parentNode.replaceChild(newR, mathEl);
          }
          modified = true;
        }
      } catch (e) {
        console.warn('Failed to convert OMML:', e);
        const mTexts = Array.from(mathEl.getElementsByTagName('*'))
          .filter((el) => el.localName === 't')
          .map((el) => el.textContent || '')
          .join('');
        if (mTexts) {
          const newR = xmlDoc.createElement('w:r');
          const newT = xmlDoc.createElement('w:t');
          newT.textContent = mTexts;
          newR.appendChild(newT);
          if (mathEl.parentNode) mathEl.parentNode.replaceChild(newR, mathEl);
          modified = true;
        }
      }
    }

    // 2. Process Equation / MathType Object images (v:imagedata, w:object, w:pict, v:shape)
    const objectNodes = allXmlElements.filter(
      (el) => el.localName === 'imagedata' || el.localName === 'shape' || el.localName === 'object' || el.localName === 'pict'
    );

    for (const node of objectNodes) {
      const rId =
        node.getAttribute('r:id') ||
        node.getAttribute('id') ||
        node.getAttribute('r:embed') ||
        node.getAttribute('src');

      if (rId && relMap[rId]) {
        const targetPath = relMap[rId];
        const zipPath = targetPath.startsWith('word/')
          ? targetPath
          : 'word/' + targetPath.replace(/^\//, '');

        const imgFile = zip.file(zipPath);
        if (imgFile) {
          try {
            const base64Data = await imgFile.async('base64');
            const extMatch = targetPath.match(/\.([a-zA-Z0-9]+)$/);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
            let mime = 'image/png';
            if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
            else if (ext === 'gif') mime = 'image/gif';
            else if (ext === 'svg') mime = 'image/svg+xml';
            else if (ext === 'webp') mime = 'image/webp';
            else if (ext === 'wmf') mime = 'image/wmf';

            const imgHtml = `<img src="data:${mime};base64,${base64Data}" style="max-height: 2.2em; vertical-align: middle; display: inline-block; margin: 0 2px;" alt="Formula" />`;

            const newR = xmlDoc.createElement('w:r');
            const newT = xmlDoc.createElement('w:t');
            newT.setAttribute('xml:space', 'preserve');
            newT.textContent = `___MATHML_START___${imgHtml}___MATHML_END___`;
            newR.appendChild(newT);

            const container =
              node.localName === 'object' || node.localName === 'pict'
                ? node
                : node.parentNode;

            if (container && container.parentNode) {
              container.parentNode.replaceChild(newR, container);
              modified = true;
            }
          } catch (err) {
            console.warn('Failed to extract embedded formula image:', err);
          }
        }
      }
    }

    if (modified) {
      const serializer = new XMLSerializer();
      const updatedDocXml = serializer.serializeToString(xmlDoc);
      zip.file('word/document.xml', updatedDocXml);
      return await zip.generateAsync({ type: 'arraybuffer' });
    }
  } catch (err) {
    console.error('Error preprocessing docx for MathML/Equations:', err);
  }
  return arrayBuffer;
}

export async function parseDocxFile(
  file: File,
  partNum: 1 | 2 | 3
): Promise<any[]> {
  const arrayBuffer = await file.arrayBuffer();
  const processedBuffer = await preprocessDocxArrayBuffer(arrayBuffer);
  const result = await mammoth.convertToHtml({ arrayBuffer: processedBuffer });
  let html = result.value;

  // Unescape MATHML blocks
  html = html.replace(/___MATHML_START___([\s\S]*?)___MATHML_END___/g, (_, inner) => {
    return inner
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
  });

  return extractQuestionsFromHtml(html, partNum);
}

export function extractQuestionsFromHtml(html: string, partNum: 1 | 2 | 3): any[] {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const blocks = Array.from(tempDiv.querySelectorAll('p, table'));
  const questions: any[] = [];

  const hasMeaningfulContent = (block: Element): boolean => {
    if (!block) return false;
    const text = ((block as HTMLElement).innerText || block.textContent || '').trim();
    return text.length > 0 || !!block.querySelector('img, math, mjx-container');
  };

  const getBlockHtml = (block: Element): string => {
    if (!block) return '';
    const clone = block.cloneNode(true) as HTMLElement;

    clone.querySelectorAll('img').forEach((img) => {
      if (!img.getAttribute('style')) {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '8px 0';
      }
    });

    return clone.innerHTML.trim();
  };

  const appendVisualBlock = (currentQ: any, block: Element) => {
    if (!currentQ || !block) return;
    const visualNodes = block.querySelectorAll('img, math, mjx-container');
    if (!visualNodes.length) return;

    const current = document.createElement('div');
    current.innerHTML = currentQ.question || '';

    const existingImageSrcs = new Set(
      Array.from(current.querySelectorAll('img'))
        .map((img) => img.getAttribute('src') || img.src)
        .filter(Boolean)
    );

    const clone = block.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || img.src;
      if (src && existingImageSrcs.has(src)) {
        img.remove();
      } else if (src) {
        existingImageSrcs.add(src);
      }
    });

    const visualHtml = clone.innerHTML.trim();
    if (visualHtml) {
      currentQ.question = (currentQ.question || '') + '<br>' + visualHtml;
    }
  };

  if (partNum === 1) {
    let currentQ: QuizQuestionP1 | null = null;

    blocks.forEach((block) => {
      if (!hasMeaningfulContent(block)) return;

      const txt = ((block as HTMLElement).innerText || block.textContent || '').trim();
      const innerHtml = getBlockHtml(block);

      if (/^\s*Câu\s+\d+[\.:]/i.test(txt)) {
        if (currentQ) questions.push(currentQ);

        currentQ = {
          question: innerHtml.replace(/^\s*Câu\s+\d+[\.:]?\s*/i, '').trim(),
          options: {},
          correct: 'A',
        };
        return;
      }

      if (currentQ && /^\s*\*?\s*"?\s*[A-D][\.:]/i.test(txt)) {
        const isStarred = txt.includes('*') || innerHtml.includes('*');
        const isUnderlined = innerHtml.includes('<u>') || innerHtml.includes('underline');
        const cleanTxt = txt.replace(/"/g, '').replace(/\*/g, '').trim();
        const optMatch = cleanTxt.match(/^([A-D])[\.:]/i);

        if (optMatch) {
          const optKey = optMatch[1].toUpperCase();
          let optContent = innerHtml
            .replace(/^<p[^>]*>/i, '')
            .replace(/<\/p>$/i, '')
            .replace(/^\s*\*?\s*"?\s*[A-D][\.:]?\s*/i, '')
            .trim();

          if (!optContent) {
            const txtMatch = cleanTxt.match(/^([A-D])[\.:]\s*(.*)/i);
            optContent = txtMatch ? txtMatch[2].trim() : '';
          }

          currentQ.options[optKey] = optContent;
          if (isStarred || isUnderlined) currentQ.correct = optKey;
        }
        return;
      }

      if (currentQ) appendVisualBlock(currentQ, block);
    });

    if (currentQ) questions.push(currentQ);
  } else if (partNum === 2) {
    let currentQ: QuizQuestionP2 | null = null;

    blocks.forEach((block) => {
      if (!hasMeaningfulContent(block)) return;

      const txt = ((block as HTMLElement).innerText || block.textContent || '').trim();
      const innerHtml = getBlockHtml(block);

      if (/^\s*Câu\s+\d+[\.:]/i.test(txt)) {
        if (currentQ) questions.push(currentQ);

        currentQ = {
          question: innerHtml.replace(/^\s*Câu\s+\d+[\.:]?\s*/i, '').trim(),
          options: {},
          correctMap: {},
        };
        return;
      }

      if (currentQ && /^\s*\*?\s*"?\s*[A-D][\.:]/i.test(txt)) {
        const isStarred = txt.includes('*') || innerHtml.includes('*');
        const isUnderlined = innerHtml.includes('<u>') || innerHtml.includes('underline');
        const cleanTxt = txt.replace(/"/g, '').replace(/\*/g, '').trim();
        const optMatch = cleanTxt.match(/^([A-D])[\.:]/i);

        if (optMatch) {
          const optKey = optMatch[1].toUpperCase();
          let optContent = innerHtml
            .replace(/^<p[^>]*>/i, '')
            .replace(/<\/p>$/i, '')
            .replace(/^\s*\*?\s*"?\s*[A-D][\.:]?\s*/i, '')
            .trim();

          if (!optContent) {
            const txtMatch = cleanTxt.match(/^([A-D])[\.:]\s*(.*)/i);
            optContent = txtMatch ? txtMatch[2].trim() : '';
          }

          currentQ.options[optKey] = optContent;
          currentQ.correctMap[optKey] = isStarred || isUnderlined ? 'DUNG' : 'SAI';
        }
        return;
      }

      if (currentQ) appendVisualBlock(currentQ, block);
    });

    if (currentQ) questions.push(currentQ);
  } else if (partNum === 3) {
    let currentQ: QuizQuestionP3 | null = null;

    blocks.forEach((block) => {
      if (!hasMeaningfulContent(block)) return;

      const txt = ((block as HTMLElement).innerText || block.textContent || '').trim();
      const innerHtml = getBlockHtml(block);

      if (/^\s*Câu\s+\d+[\.:]/i.test(txt)) {
        if (currentQ) questions.push(currentQ);

        currentQ = {
          question: innerHtml.replace(/^\s*Câu\s+\d+[\.:]?\s*/i, '').trim(),
          correct: '',
        };
        return;
      }

      if (currentQ && (txt.startsWith('*') || txt.toLowerCase().includes('đáp án'))) {
        currentQ.correct = txt
          .replace(/"/g, '')
          .replace(/^\*\s*Đáp\s*án[\.:]?\s*/i, '')
          .replace(/^Đáp\s*án[\.:]?\s*/i, '')
          .replace(/^\*\s*/, '')
          .trim();
        return;
      }

      if (currentQ) appendVisualBlock(currentQ, block);
    });

    if (currentQ) questions.push(currentQ);
  }

  return questions;
}

