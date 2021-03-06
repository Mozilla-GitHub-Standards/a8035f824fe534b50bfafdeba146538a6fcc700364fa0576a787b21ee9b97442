import { assert } from 'chai';
import { default as urlJobProcessor } from '../crawler/urlJobProcessor.js';
import { default as nock } from 'nock';
import { default as portfinder } from 'portfinder';
import { default as https } from 'https';
import { default as fs } from 'fs';

let probes;

describe('processUrlJob for a site', () => {
  beforeEach(() => {
    probes = {
      hasHTTPS: false,
      hasHSTS: false,
      hasHTTPSRedirect: false,
      hasManifest: false,
      hasServiceWorker: false,
      hasPushSubscription: false,
    };
  });

  afterEach(() => {
    nock.cleanAll();
  });

  context('responding 404 to http and no https', () => {
    it('should fail on all probes', () => {
      const site = nock('http://localhost:8000')
      .get('/')
      .reply(404);

      return urlJobProcessor.processUrlJob({ title: 'localhost:8000' })
      .then(ret => {
        assert.ok(site.isDone());
        assert.deepEqual(ret, probes);
      });
    });
  });

  context('has no https', () => {
    it('should fail on all probes', () => {
      const site = nock('http://localhost:8000')
      .get('/')
      .reply(200, '<html></html>');

      return urlJobProcessor.processUrlJob({ title: 'localhost:8000' })
      .then(ret => {
        assert.ok(site.isDone());
        assert.deepEqual(ret, probes);
      });
    });
  });

  context('with http and https response', () => {
    it('should pass hasHTTPS', () => {
      nock('http://localhost')
      .get('/')
      .reply(200, '<html></html>');

      const site = nock('http://localhost:443')
      .get('/')
      .reply(200, '<html></html>');

      return urlJobProcessor.processUrlJob({ title: 'localhost' })
      .then(ret => {
        assert.ok(site.isDone());
        probes.hasHTTPS = true;
        assert.deepEqual(ret, probes);
      });
    });
  });

  context('with manifest in http response but not in https one', () => {
    it('should pass hasHTTPS', () => {
      nock('http://localhost')
      .get('/')
      .reply(200, '<html><link rel="manifest"></html>');

      const site = nock('http://localhost:443')
      .get('/')
      .reply(200, '<html></html>');

      return urlJobProcessor.processUrlJob({ title: 'localhost' })
      .then(ret => {
        assert.ok(site.isDone());
        probes.hasHTTPS = true;
        assert.deepEqual(ret, probes);
      });
    });
  });

  context('with manifest in https response', () => {
    it('should pass hasHTTPS', () => {
      nock('http://localhost')
      .get('/')
      .reply(200, '<html></html>');

      const site = nock('http://localhost:443')
      .get('/')
      .reply(200, '<html><link rel="manifest"></html>');

      return urlJobProcessor.processUrlJob({ title: 'localhost' })
      .then(ret => {
        assert.ok(site.isDone());
        probes.hasHTTPS = true;
        probes.hasManifest = true;
        assert.deepEqual(ret, probes);
      });
    });
  });

  context('with service worker registration', () => {
    it('should pass hasServiceWorker', () => {
      nock('http://localhost')
      .get('/')
      .reply(200, '<html></html>');

      const site = nock('http://localhost:443')
      .get('/')
      .reply(200, '<html><script src="https://localhost/index.js"></html>')
      .get('/index.js')
      .reply(200, 'navigator.serviceWorker.register(\'sw.js\');');

      return urlJobProcessor.processUrlJob({ title: 'localhost' })
      .then(ret => {
        assert.ok(site.isDone());
        probes.hasHTTPS = true;
        probes.hasServiceWorker = true;
        assert.deepEqual(ret, probes);
      });
    });
  });

  context('with push subscription', () => {
    it('should pass hasPushSubscription', () => {
      nock('http://localhost')
      .get('/')
      .reply(200, '<html></html>');

      const site = nock('http://localhost:443')
      .get('/')
      .reply(200, '<html><script src="https://localhost/index.js"></html>')
      .get('/index.js')
      .reply(200, 'registration.pushManager.subscribe();');

      return urlJobProcessor.processUrlJob({ title: 'localhost' })
      .then(ret => {
        assert.ok(site.isDone());
        probes.hasHTTPS = true;
        probes.hasPushSubscription = true;
        assert.deepEqual(ret, probes);
      });
    });
  });
});

describe('recaction to broken sites', () => {
  let nodeTlsEnv;

  before(() => {
    nodeTlsEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  });

  after(() => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = nodeTlsEnv;
  });

  context('with a broken gzip', () => {
    it('should silence the error', () => {
      let closePromise;

      function getPort() {
        return new Promise((resolve, reject) => {
          portfinder.getPort((err, port) => {
            if (err) {
              return reject(err);
            }
            resolve(port);
          });
        });
      }

      function serveGzip(port, data) {
        const options = {
          key: fs.readFileSync('test/fixtures/server.key'),
          cert: fs.readFileSync('test/fixtures/server.crt'),
          requestCert: false,
          rejectUnauthorized: false,
        };

        const server = https.createServer(options, (req, res) => {
          res.writeHead(200, { 'Content-Encoding': 'gzip' });
          res.end(data);
          server.close();
        }).listen(port);

        closePromise = new Promise(resolve => {
          server.on('close', resolve);
        });

        return new Promise(resolve => {
          server.on('listening', resolve);
        });
      }

      return new Promise((resolve, reject) => {
        fs.readFile('./test/attachments/broken.gz', 'utf8', (err, data) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(data);
        });
      })
      .then(data => getPort()
        .then(port => serveGzip(port, data)
          .then(() => urlJobProcessor.processUrlJob({ title: `localhost:${port}` }))
        )
      )
      .then(ret => {
        assert.ok(ret);
        return closePromise;
      });
    });
  });
});
