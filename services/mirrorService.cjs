'use strict';

const config = require('../helpers/configHelper.cjs');

class MirrorService {
  constructor() {
    this.registryUrl = config.mirror.registryUrl;
  }

  // ADR-025(모델/데이터 라이선스 검토)가 대기 중이라 반입 승인 로직은 아직 구현하지 않음.
  async listMirroredPackages(kind) {
    // kind: 'pip' | 'npm'
    // TODO: Gitea Registry(또는 별도 미러 저장소) 실제 조회 연동
    return { kind, packages: [] };
  }

  async importOciImage(imageRef) {
    // TODO: crictl + containerd import 실행 (오프라인 반입, ADR-008)
    return { imageRef, registry: this.registryUrl, status: 'not_implemented' };
  }
}

module.exports = new MirrorService();
