import * as THREE from 'three';

const COS_SPLIT = Math.cos(1 * Math.PI / 180);

function isBakedHardEdge(e) {
  if (e.t1 < 0) return true;               // открытая граница — всегда жёсткая
  const a = e.n0, b = e.n1;
  if (!a || !b) return false;              // в файле нет нормалей
  const dp = a[0]*b[0] + a[1]*b[1] + a[2]*b[2];   // нормали в точке P
  const dq = a[3]*b[3] + a[4]*b[4] + a[5]*b[5];   // нормали в точке Q
  return dp < COS_SPLIT || dq < COS_SPLIT;
}

function buildTopology(model) {
  model.updateMatrixWorld(true);
  const fN = [], fC = [], fMat = [];
  const edgeMap = new Map();
  const matIds = new Map();
  const matIdOf = (m) => {
    const key = m ? m.uuid : 'none';
    if (!matIds.has(key)) matIds.set(key, matIds.size);
    return matIds.get(key);
  };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const nA = new THREE.Vector3(), nB = new THREE.Vector3(), nC = new THREE.Vector3();
  const AB = new THREE.Vector3(), AC = new THREE.Vector3(), N = new THREE.Vector3();
  const nrmMat = new THREE.Matrix3();
  let faceCount = 0, meshesWithoutNormals = 0, meshCount = 0;
  // Округление до 1e-3 мировых единиц: модель нормализована до ~100 ед.,
  // поэтому это 1e-5 относительной точности — сваривает совпадающие вершины
  // разных примитивов, не склеивая реально разные.
  const K = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;

  model.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const geo = node.geometry;
    const posAttr = geo.attributes.position;
    if (!posAttr) return;
    const nrmAttr = geo.attributes.normal || null;
    meshCount++;
    if (!nrmAttr) meshesWithoutNormals++;
    const index = geo.index;
    const triCount = Math.floor((index ? index.count : posAttr.count) / 3);
    if (!triCount) return;
    const mw = node.matrixWorld;
    nrmMat.getNormalMatrix(mw);
    const mats = Array.isArray(node.material) ? node.material : [node.material];

    // Мультиматериальная геометрия внутри одного меша (редко после GLTFLoader,
    // но поддерживаем): карта треугольник → локальный индекс материала.
    let triMatLocal = null;
    if (geo.groups && geo.groups.length && mats.length > 1) {
      triMatLocal = new Int32Array(triCount);
      for (const g of geo.groups) {
        const tS = Math.floor(g.start / 3);
        const tE = Math.min(triCount, Math.floor((g.start + g.count) / 3));
        for (let t = tS; t < tE; t++) triMatLocal[t] = g.materialIndex || 0;
      }
    }
    const singleMatId = matIdOf(mats[0]);

    const vI = (t, k) => index ? index.getX(t * 3 + k) : t * 3 + k;

    // Скаляры, а не Vector3: A/B/C переиспользуются между треугольниками,
    // ссылку на них хранить в edgeMap нельзя.
    const addEdge = (x1,y1,z1, ax,ay,az, x2,y2,z2, bx,by,bz, tri) => {
      const ka = K(x1,y1,z1), kb = K(x2,y2,z2);
      if (ka === kb) return;                       // вырожденное ребро
      // Канонический порядок концов: у обеих смежных граней P и Q — одни и те
      // же точки, поэтому нормали сравниваются в соответствующих вершинах.
      const flip = ka > kb;
      const key = flip ? kb + '|' + ka : ka + '|' + kb;
      const nrm = nrmAttr
        ? (flip ? [bx,by,bz, ax,ay,az] : [ax,ay,az, bx,by,bz])
        : null;
      let e = edgeMap.get(key);
      if (!e) {
        e = flip
          ? { key, px:x2, py:y2, pz:z2, qx:x1, qy:y1, qz:z1, t0:tri, t1:-1, n:1, n0:nrm, n1:null }
          : { key, px:x1, py:y1, pz:z1, qx:x2, qy:y2, qz:z2, t0:tri, t1:-1, n:1, n0:nrm, n1:null };
        edgeMap.set(key, e);
      } else {
        if (e.n === 1) { e.t1 = tri; e.n1 = nrm; }
        e.n++;
      }
    };

    for (let t = 0; t < triCount; t++) {
      const iA = vI(t,0), iB = vI(t,1), iC = vI(t,2);
      A.fromBufferAttribute(posAttr, iA).applyMatrix4(mw);
      B.fromBufferAttribute(posAttr, iB).applyMatrix4(mw);
      C.fromBufferAttribute(posAttr, iC).applyMatrix4(mw);
      AB.subVectors(B, A); AC.subVectors(C, A);
      N.crossVectors(AB, AC);
      const len = N.length();
      if (len < 1e-12) continue;                   // вырожденный треугольник
      N.divideScalar(len);
      if (nrmAttr) {
        nA.fromBufferAttribute(nrmAttr, iA).applyMatrix3(nrmMat).normalize();
        nB.fromBufferAttribute(nrmAttr, iB).applyMatrix3(nrmMat).normalize();
        nC.fromBufferAttribute(nrmAttr, iC).applyMatrix3(nrmMat).normalize();
      }
      const tri = faceCount++;
      fN.push(N.x, N.y, N.z);
      fC.push((A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3, (A.z + B.z + C.z) / 3);
      fMat.push(triMatLocal ? matIdOf(mats[triMatLocal[t]] || mats[0]) : singleMatId);
      addEdge(A.x,A.y,A.z, nA.x,nA.y,nA.z, B.x,B.y,B.z, nB.x,nB.y,nB.z, tri);
      addEdge(B.x,B.y,B.z, nB.x,nB.y,nB.z, C.x,C.y,C.z, nC.x,nC.y,nC.z, tri);
      addEdge(C.x,C.y,C.z, nC.x,nC.y,nC.z, A.x,A.y,A.z, nA.x,nA.y,nA.z, tri);
    }
  });

  const edges = [...edgeMap.values()];
  let manifold = 0, bakedHard = 0;
  for (const e of edges) if (e.n === 2) { manifold++; if (isBakedHardEdge(e)) bakedHard++; }

  return {
    fN: Float64Array.from(fN),
    fC: Float64Array.from(fC),
    fMat: Int32Array.from(fMat),
    faceCount,
    edges,
    byKey: edgeMap,
    materialCount: matIds.size,
    hasNormals: meshCount > 0 && meshesWithoutNormals === 0,
    manifoldCount: manifold,
    bakedHardCount: bakedHard,
  };
}

export { isBakedHardEdge, buildTopology };
