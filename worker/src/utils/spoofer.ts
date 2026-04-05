import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

/**
 * spoofVideo - Modifies video to change its digital signature (hash)
 * 1. Removes metadata
 * 2. Modifies bitrate (+/- 5%)
 * 3. 1% Center Crop
 * 4. Adds nearly invisible noise
 */
export async function spoofVideo(inputPath: string): Promise<string> {
    const outputDir = path.dirname(inputPath);
    const ext = path.extname(inputPath);
    const outputPath = path.join(outputDir, `spoofed_${Date.now()}${ext}`);

    return new Promise((resolve, reject) => {
        // 1% Crop calculation
        // We'll use a filter string for complex operations
        // crop=iw*0.99:ih*0.99:iw*0.005:ih*0.005
        // noise=alls=5:allf=t (adds subtle noise)

        ffmpeg(inputPath)
            .outputOptions([
                '-map_metadata -1', // Remove all metadata
                '-vf', 'crop=iw*0.99:ih*0.99:iw*0.005:ih*0.005,noise=alls=1:allf=t',
                '-b:v', '5M', // Target bitrate (could be randomized)
            ])
            .videoBitrate('105%') // Slightly change bitrate
            .on('start', (commandLine) => {
                console.log('Spawned Ffmpeg with command: ' + commandLine);
            })
            .on('error', (err) => {
                console.error('Ffmpeg error: ' + err.message);
                reject(err);
            })
            .on('end', () => {
                console.log('Video spoofing finished !');
                resolve(outputPath);
            })
            .save(outputPath);
    });
}
