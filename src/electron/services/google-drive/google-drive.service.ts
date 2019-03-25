import { app } from 'electron';
import * as fs from 'fs';
import { GaxiosResponse } from 'gaxios';
import { OAuth2Client } from 'google-auth-library';
// tslint:disable-next-line: no-submodule-imports
import { drive_v3, google } from 'googleapis';
import * as path from 'path';
import { BehaviorSubject, combineLatest, from, interval, Subject } from 'rxjs';
import { buffer, filter, mergeMap, scan, tap } from 'rxjs/operators';
import * as stream from 'stream';
import { Clip } from './../../models/models';

const BUFFER_TIME = 60000;

const createStream = (str: string) => {
  const readableStream = new stream.Readable();
  readableStream.push(str);
  readableStream.push(null);
  return readableStream;
};

// tslint:disable: max-classes-per-file
export class DriveHandler {
  private static _driveHandler = new DriveHandler();
  private static _drive: drive_v3.Drive;
  private pageTokenBehaviorSubject: BehaviorSubject<
    string
  > = new BehaviorSubject<string>('');

  private get driveHandler() {
    return DriveHandler._driveHandler;
  }

  public get drive() {
    return DriveHandler._drive;
  }

  public setDrive(googleOAuth2Client: OAuth2Client) {
    DriveHandler._drive = google.drive({
      version: 'v3',
      auth: googleOAuth2Client
    });
  }

  public setPageToken(pageToken: string) {
    this.driveHandler.pageTokenBehaviorSubject.next(pageToken);
  }

  public async getStartPageToken() {
    return (await this.driveHandler.drive.changes.getStartPageToken({})).data
      .startPageToken;
  }

  public pageTokenAsObservable() {
    return this.driveHandler.pageTokenBehaviorSubject.asObservable();
  }

  /**
   * Watches for changes in appDataFolder
   *
   * @return Changes and new page token
   */
  public getDriveAsObservable() {
    let changeCount = 0;
    return this.driveHandler.pageTokenBehaviorSubject.asObservable().pipe(
      mergeMap(async _pageToken => {
        console.log('Watching for changes... ', (changeCount += 1));
        const {
          newStartPageToken,
          nextPageToken,
          changes
        } = (await this.driveHandler.drive.changes.list({
          spaces: 'appDataFolder',
          pageToken: _pageToken,
          fields: '*'
        })).data;

        setTimeout(
          () =>
            this.driveHandler.pageTokenBehaviorSubject.next(
              nextPageToken || newStartPageToken
            ),
          BUFFER_TIME
        );
        return { changes, pageToken: nextPageToken || newStartPageToken };
      }),
      filter(({ changes }) => changes.length > 0)
    );
  }
}

export default class GoogleDriveService {
  private clipSubject = new Subject<Clip>();
  constructor(private driveHandler: DriveHandler) {}

  private observeFileAdder() {
    const addFileToDrive = async (
      clips: Clip[]
    ): Promise<GaxiosResponse<drive_v3.Schema$File>> => {
      const clipMap = clips.reduce(
        (acc: { [key: string]: Clip }, currentClip) => {
          acc[currentClip.id] = currentClip;
          return acc;
        },
        {}
      );
      const fileMetadata = {
        name: 'clips.json',
        parents: ['appDataFolder']
      };
      const media = {
        mimeType: 'application/json',
        body: createStream(JSON.stringify(clipMap))
      };

      console.log('Connecting... Adding file to Drive');
      return this.driveHandler.drive.files.create(({
        resource: fileMetadata,
        media,
        fields: 'id'
      } as unknown) as any);
    };

    return this.clipSubject.asObservable().pipe(
      buffer(interval(BUFFER_TIME)),
      filter(clip => clip.length > 0),
      mergeMap(clips => from(addFileToDrive(clips))),
      scan(
        (
          acc: { [id: string]: GaxiosResponse<drive_v3.Schema$File> },
          curr: GaxiosResponse<drive_v3.Schema$File>
        ): { [id: string]: GaxiosResponse<drive_v3.Schema$File> } => {
          acc[curr.data.id] = curr;
          return acc;
        },
        {}
      )
    );
  }

  private downloadFile(fileId: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const userDataDir = path.join(app.getPath('userData'), 'temp');
      const filePath = path.join(userDataDir, `${fileId}.json`);
      const dest = fs.createWriteStream(filePath);

      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }

      try {
        const response = await this.driveHandler.drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'stream' }
        );
        (response.data as any)
          .on('end', () => {
            console.log('Done downloading file');
            // File needs some more time to be created
            setTimeout(() => resolve(filePath), 0);
          })
          .on('error', err => {
            console.error('Error downloading file');
            reject(err);
          })
          .on('data', d => {})
          .pipe(dest);
      } catch (err) {
        reject(err);
      }
    });
  }

  public async addClipToDrive(clip: Clip) {
    this.clipSubject.next(clip);
  }

  public async getUserInfo() {
    return this.driveHandler.drive.about.get({ fields: 'user' });
  }

  public listenForChanges() {
    const driveObservable = this.driveHandler.getDriveAsObservable();
    const fileAdderObservable = this.observeFileAdder();
    return combineLatest(driveObservable, fileAdderObservable).pipe(
      tap(([drive, addedFiles]) => console.log(drive.changes, addedFiles)),
      filter(([drive, addedFiles]) => drive.changes.length > 0),
      mergeMap(async ([drive, addedFiles]) => {
        const filePaths = await Promise.all(
          drive.changes
            .filter(
              change =>
                !change.removed &&
                !Object.keys(addedFiles).find(id => id === change.fileId)
            )
            .map(change => this.downloadFile(change.fileId))
        );

        const reducedClips = filePaths.reduce(
          (acc: { [key: string]: Clip }, filePath) => {
            const _clips: { [key: string]: Clip } = JSON.parse(
              fs.readFileSync(filePath, 'utf8') || 'null'
            );

            Object.entries(_clips).forEach(([key, clip]) => {
              acc[key] =
                acc[key] && acc[key].updatedAt > clip.updatedAt
                  ? acc[key]
                  : clip;
            });
            return acc;
          },
          {}
        );
        const clips: Clip[] = Object.values(reducedClips);
        filePaths.forEach(_path => {
          fs.unlink(_path, err => {
            if (err) {
              throw err;
            }
            console.log(`${_path} was deleted.`);
          });
        });
        return clips;
      }),
      tap(clips =>
        console.log(
          clips.length > 0
            ? `New updates found: ${clips.length}.`
            : '...Nothing new found'
        )
      ),
      filter(clips => clips.length > 0)
    );
  }
}

// private async listClipboardFiles() {
//   const result = await this.drive.files.list({
//     spaces: 'appDataFolder',
//     fields: 'nextPageToken, files(id, name)',
//     pageSize: 100
//   });
//   return result.data.files;
// }
