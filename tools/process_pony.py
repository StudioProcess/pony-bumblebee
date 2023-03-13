#!/usr/bin/env python3
# Python 3.10

'''
    ./process_tars.py <in_folder> [<out_folder> = .] [options]
    
    Force Quit ... Ctrl-c (SIGINT)
    
    options:
    -y ... skip initial confirmation dialog
    
    --extract ... extract tars; specify tar folder with in_folder; extraction will be placed in out_folder/<in_folder_basename>_processed
        --from, --to ... only the specified tars (sorted order)
        --tar_v ... tar option v, verbose
        --tar_k ... tar option k, keep old files, i.e. don't overwrite
    
    --sheets ... generate contact sheets; specify extracted folder with in_folder (when --extract is not present)
        --from, --to ... only the specified sequence numbers
    --movies ... generate movies specify extracted folder with in_folder (when --extract is not present)
        --from, --to ... only the specified sequence numbers
    
    --check_tars ... check presence of files within tars
    --check_extracted ... check presence of files in extracted folder
    --check_integrity ... check presence as well as png and json file integrity in extracted folder
    
    --archive ... compress stuff from extracted folder ('all', 'images', 'frames', 'movies', 'meta', 'sheets')
    --001 ... use split utility to produce .zip.001, .zip.002, etc. instead of multipart .zip, .z01, .z02, etc.
    
    Required utilities:
    * tar
    * zip
    * split
    * ffmpeg
    * graphicsmagick
'''

OUTDIR_SUFFIX = '_processed'

TAR_IMAGES_DIR = 'images'
TAR_FRAMES_DIR = 'frames'
TAR_META_DIR = 'metadata'
OUT_SHEETS_DIR = 'overviews'
OUT_MOVIES_DIR = 'videos'

SHEET_PREFIX = 'overview_'

MOVIE_FRAMES = 300
MOVIE_LOOPS = 1
MOVIE_INPUT_FPS = 25
MOVIE_OUTPUT_FPS = 25
MOVIE_RES = (-1, -1) # use -1 for both components to keep resolution unchanged
MOVIE_CRF_H264 = 25 # default 23
MOVIE_CRF_H265 = 30 # default 28

# H264 (needs level 5 for 1920, level 6 for 3840)
# Only '-preset veryslow' produces no artifacts; Adding '-tune animation' fixes artifacts with faster presets, but results in bigger files and worse seeking time; Note: Artifacts only in quicktime player, NOT in VLC; Artifacts appear both on ffmpeg 4.4.2 (Ubuntu) and 5.0.1 (Darwin) 
MOVIE_ENCODE = (f'-c:v libx264 -profile:v main -level:v 6 -crf {MOVIE_CRF_H264} -preset veryslow -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart', 'mp4')
# H264 Youtube Recommended Settings https://support.google.com/youtube/answer/1722171 (MP4, faststart, high profile, 2 b-frames, GOP half the framerate, 4:2:0 chroma)
#MOVIE_ENCODE = (f'-c:v libx264 -profile:v high -level:v 6 -crf {MOVIE_CRF_H264} -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart -x264-params bframes=2:keyint={MOVIE_OUTPUT_FPS//2}', 'mp4')
# H265
#MOVIE_ENCODE = (f'-c:v libx265 -crf {MOVIE_CRF_H265} -preset medium -tag:v hvc1 -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart', 'mp4')
# GIF
#MOVIE_ENCODE = (f'-vf "fps={MOVIE_OUTPUT_FPS},scale={MOVIE_RES[0]}:{MOVIE_RES[1]}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0', 'gif')

CHECK_IMAGES = 8760
CHECK_FRAMES = 300

ZIP_SPLIT = '5g'

import sys
import os
import os.path
import math
import re
import fnmatch
import signal
import shutil
import subprocess
import argparse
import time
import datetime
import tarfile
from functools import reduce
import glob
import json

class COLORS:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'

def signal_handler(sig, stack=None):
    print(f'\nCaught signal {signal.Signals(sig).name}: Exiting')
    print_elapsed()
    exit(1)
    
def run_cmd(cmd, return_exitcode_only=True):
    # os.system is simple, but will signals won't work
    # shell allows to specify cmd as a single string, as opposed to a list of args
    completed_process = subprocess.run(cmd, shell=True)
    if return_exitcode_only: return completed_process.returncode
    else: return completed_process

# patterns are matches using fnmatch https://docs.python.org/3/library/fnmatch.html
def list_files(folder, pattern = '*'):
    try:
        files = os.listdir(folder)
    except FileNotFoundError:
        return []
    files = filter(lambda x: os.path.isfile(folder + '/' + x), files)
    files = list( filter(lambda x: fnmatch.fnmatch(x, pattern), files) ) 
    files.sort()
    files = list( map(lambda x: folder + '/' + x, files) )
    return files

def list_folders(folder, pattern = '*'):
    try:
        files = os.listdir(folder)
    except FileNotFoundError:
        return []
    files = filter(lambda x: os.path.isdir(folder + '/' + x), files)
    files = list( filter(lambda x: fnmatch.fnmatch(x, pattern), files) ) 
    files.sort()
    files = list( map(lambda x: folder + '/' + x, files) )
    return files

def list_files_recursive(folder, exclude_dotfiles = True, print_progress=True):
    out = []
    for root, dirs, files in os.walk(folder):
        if exclude_dotfiles: files = filter(lambda x: not x.startswith('.'), files)
        root = root[len(folder)+1:] if root.startswith(folder + '/') else root # remove base folder from path
        paths = list( map(lambda x: os.path.join(root, x) , files) )
        out = out + paths
        if print_progress: print(f'Listing {root}: {len(paths)} files — {len(out)} total')
    out.sort()
    return out

def extract_tars(tarlist, dest_folder, from_ = 0, to_ = 0):
    from_ = max(1, from_)
    if to_ <= 0: to_ = len(tarlist)
    to_ = max(from_, to_)
    if (from_ > 1 or to_ < len(tarlist)-1): print(f'Range: {from_}-{to_}')
    if (args.tar_v): print('Using tar option v (verbose)')
    v = 'v' if args.tar_v else ''
    if (args.tar_k): 
        print('Using tar option k (keep old files)')
        # Mac: -k --keep-old-files ... Do not overwrite existing files.  In particular, if a file appears more than once in an archive, later copies will not overwrite earlier copies.
        # Linux: --skip-old-files ... Don't replace existing files when extracting, silently skip over them.
        k = '-k' if sys.platform == 'darwin' else '--skip-old-files'
    else: k = ''
    for i, tar in enumerate(tarlist):
        if (i+1) < from_ or (i+1) > to_: continue # skip
        print(f'({i+1}/{len(tars)}) Extracting {tar}')
        # x .. extract, f .. from file; tar overwrites by default (k to keep)
        run_cmd(f'tar xf{v} "{tar}" {k} --directory "{dest_folder}"')

def list_tar_contents(tarlist, remove_duplicates = False, print_progress=True):
    out = []
    for i, name in enumerate(tarlist):
        tar = tarfile.open(name)
        files = tar.getnames()
        tar.close()
        if remove_duplicates: files = list(set(files))
        out = out + files
        if print_progress: print(f'({i+1}/{len(tarlist)}) Listing {os.path.basename(name)}: {len(files)} files — {len(out)} total')
    return out

def filename_only(path, include_ext = True):
    filename = os.path.basename(path)
    if not include_ext:
        filename = os.path.splitext(filename)[0]
    return filename

def input_dir_type(dir):
    '''
    returns extraction|tar|nonexistent
    '''
    if not os.path.exists(dir): return 'nonexistent'
    # extraction contains folders TAR_IMAGES_DIR, TAR_FRAMES_DIR, and TAR_META_DIR
    dirs = map(lambda x: os.path.join(dir, x), [TAR_IMAGES_DIR, TAR_FRAMES_DIR, TAR_META_DIR])
    dirs_exist = map(os.path.exists, dirs)
    if all(dirs_exist): return 'extraction'
    # assume tar folder (avoid listing)
    return 'tar'

def create_contactsheets(pnglist, dest_folder, size = 500, border_w = 30, border_h = 8, tiles_x = 8, tiles_y = 5):
    per_page = tiles_x * tiles_y
    pages = math.ceil( len(pnglist) / per_page )
    print(f'{pages} sheets, {per_page} images each')
    
    for i in range(pages):
        imgs = pnglist[0:per_page] # take a batch
        first = filename_only(imgs[0], include_ext=False)
        last = filename_only(imgs[-1], include_ext=False)
        outfile = os.path.join(dest_folder, f'{SHEET_PREFIX}{i+1:03d}_{first}-{last}.png')
        print(f'({i+1}/{pages}) {first}..{last} ({len(imgs)}) -> {outfile}')
        run_cmd(f'gm montage -pointsize 30 -label \'%t\' -geometry {size}x{size}+{border_w}+{border_h} -tile {tiles_x}x{tiles_y} -background white -depth 8 {" ".join(imgs)} miff:- | gm convert - -bordercolor white -border {border_w}x{2*border_w-border_h} "{outfile}"')
        pnglist = pnglist[per_page:] # rest of list

def ffmpeg(pattern, in_fps, out_fps, target='out.mp4'):
    scale = f'-filter:v scale={MOVIE_RES[0]}:{MOVIE_RES[1]}:force_divisible_by=2:force_original_aspect_ratio=decrease' if MOVIE_RES and (MOVIE_RES[0] > 0 or MOVIE_RES[1] > 0) else ''
    frames = int(MOVIE_FRAMES * MOVIE_LOOPS)
    # signals don't seem to work with os.system, see: https://stackoverflow.com/a/27083472
    if MOVIE_ENCODE[1] == 'gif':
        return run_cmd(f'ffmpeg -y -f image2 -framerate {in_fps} -i \'{pattern}\' {MOVIE_ENCODE[0]} \'{target}\'')
    else:
        return run_cmd(f'ffmpeg -y -f image2 -loop 1 -framerate {in_fps} -i \'{pattern}\' -r {out_fps} -frames:v {frames} {MOVIE_ENCODE[0]} {scale} \'{target}\'')

def create_movies(png_folders, dest_folder):
    for i, folder in enumerate(png_folders):
        seq = os.path.basename(folder)
        outfile = os.path.join(dest_folder, f'{seq}.{MOVIE_ENCODE[1]}')
        pattern = os.path.join(folder, f'{seq}_%04d.png')
        print()
        print(f'({i+1}/{len(png_folders)}) {folder} -> {outfile}')
        code = ffmpeg(pattern, MOVIE_INPUT_FPS, MOVIE_OUTPUT_FPS, outfile)
        print_elapsed()

def print_elapsed():
    global start_time
    elapsed = datetime.timedelta(seconds = math.floor(time.time()-start_time) )
    print(f'Elapsed time: {str(elapsed)}')
    
def runs(nums, sort = True, singles_as_list = True):
    def fn(res, num):
        if len(res) == 0: 
            res.append([num])
        else: 
            current_run = res[-1]
            if num == current_run[-1]: # same number
                pass # ignore
            elif num == current_run[-1] + 1: # next number
                if len(current_run) == 1: current_run.append(num) # add run end
                else: current_run[1] = num # change run end
            else: # not the next number
                res.append([num])
        return res
    if sort: nums = sorted(nums)
    runs = reduce(fn, nums, [])
    if (not singles_as_list):
        runs = list(map(lambda x: x if len(x) > 1 else x[0], runs))
    return runs

def format_runs(runs):
    strings = map(lambda x: '-'.join(str(s) for s in x) if isinstance(x, list) else str(x), runs)
    return ', '.join(strings)

def check_complete(files, start_idx, stop_idx, idx_width=4, prefix='', postfix='.png'):
    # files ... anything that supports the 'in' operator: list, dict, set
    for i in range(start_idx, stop_idx):
        name = prefix + str(i).zfill(idx_width) + postfix
        if name not in files: return False
    return True

def partition_framelist(frames):
    # frames/0001/0001_0000.png, frames/0001/0001_0001.png, ..., frames/0002/0002_0000.png, frames/0002/0002_0001.png, ...
    # returns dict: seq_no -> [list of paths]
    out = {}
    start = len(TAR_FRAMES_DIR) + 1
    end = start + 4
    for path in frames:
        no = int( path[start:end] )
        if no not in out: out[no] = []
        part = out[no]
        part.append(path)
    return out

def check_files(files, pwd = None):
    '''check tar contents: stills, movies, metadata for completeness'''
    print(f'Checking {len(files)} files')
    # files = list(set(files))
    # print(f'{len(files)} files without duplicates')
    # files = sorted(files)
    
    # check images
    images = set( filter(lambda x: x.startswith(TAR_IMAGES_DIR + '/'), files) )
    print(f'{len(images)} images')
    if len(images) == 0:
        print(f'   {COLORS.YELLOW}NO images{COLORS.END}')
    else:
        images_complete = check_complete(images, 1, CHECK_IMAGES, prefix=TAR_IMAGES_DIR + '/')
        print(f'   {COLORS.GREEN}images COMPLETE{COLORS.END}' if images_complete else f'   {COLORS.YELLOW}images NOT complete{COLORS.END}')
        image_numbers = list(map(lambda x: int(os.path.splitext(os.path.basename(x))[0]), images))
        image_numbers.sort()
        image_runs = runs(image_numbers)
        print(f'   {len(image_runs)} image runs', end='')
        if (len(image_runs) < 100): print(f': {format_runs(image_runs)}')
        else: print()
        # check PNG integrity
        if pwd: # only if working directory is given, are we dealing with extracted files
            paths = list(map(lambda x: os.path.join(pwd, x), images))
            paths.sort()
            errors = check_pngs(paths)
            if len(errors) == 0:
                print(f'   {COLORS.GREEN}image integrity VERIFIED{COLORS.END}')
            else:
                print(f'   {COLORS.RED}image integrity NOT verified{COLORS.END}')
                print(f'   {len(errors)} error(s):')
                print(f'   {", ".join(errors)}')
    
    # check metadata
    meta = set( filter(lambda x: x.startswith(TAR_META_DIR + '/'), files) )
    # meta = list( set(meta) ) # remove duplicates
    print(f'{len(meta)} metadata files')
    if len(meta) == 0:
        print(f'   {COLORS.YELLOW}NO metadata files{COLORS.END}')
    else:
        meta_complete = check_complete(meta, 1, CHECK_IMAGES, prefix=TAR_META_DIR + '/', postfix='.json')
        print(f'   {COLORS.GREEN}metadata COMPLETE{COLORS.END}' if meta_complete else f'   {COLORS.YELLOW}metadata NOT complete{COLORS.END}')
        meta_numbers = list(map(lambda x: int(os.path.splitext(os.path.basename(x))[0]), meta))
        meta_numbers.sort()
        meta_runs = runs(meta_numbers)
        meta_matches_images = (meta_runs == image_runs)
        print(f'   {COLORS.GREEN}metadata MATCHES images{COLORS.END}' if meta_matches_images else f'   {COLORS.YELLOW}metadata NOT matching images{COLORS.END}')
        # if not meta_matches_images:
        print(f'   {len(meta_runs)} metadata runs', end='')
        if (len(meta_runs) < 100): print(f': {format_runs(meta_runs)}')
        else: print()
        # check JSON integrity
        if pwd: # only if working directory is given, are we dealing with extracted files
            paths = list(map(lambda x: os.path.join(pwd, x), meta))
            paths.sort()
            errors = check_jsons(paths)
            if len(errors) == 0:
                print(f'   {COLORS.GREEN}metadata integrity VERIFIED{COLORS.END}')
            else:
                print(f'   {COLORS.RED}metadata integrity NOT verified{COLORS.END}')
                print(f'   {len(errors)} error(s):')
                print(f'   {", ".join(errors)}')
    
    # check frames
    frames = set( filter(lambda x: x.startswith(TAR_FRAMES_DIR + '/'), files) )
    print(f'{len(frames)} frames')
    if len(frames) == 0:
        print(f'   {COLORS.YELLOW}NO frames {COLORS.END}')
    else:
        # print(frames)
        complete_anims = []
        incomplete = 0
        for no in range(1, CHECK_IMAGES+1):
            no_formatted = str(no).zfill(4)
            complete = check_complete(frames, 0, CHECK_FRAMES-1, prefix=f'{TAR_FRAMES_DIR}/{no_formatted}/{no_formatted}_')
            if complete: complete_anims.append(no)
            else: incomplete += 1
            if no % 100 == 0: print(f'   found complete anims: {len(complete_anims)}, incomplete: {incomplete}')
        print(f'   {len(complete_anims)} complete anims, {incomplete} incomplete')
        anims_complete = (len(complete_anims) == CHECK_IMAGES)
        print(f'   {COLORS.GREEN}frames COMPLETE{COLORS.END}' if meta_complete else f'   {COLORS.YELLOW}frames NOT complete{COLORS.END}')
        anim_runs = runs(complete_anims)
        anims_match_images = (anim_runs == image_runs)
        print(f'   {COLORS.GREEN}complete anims MATCH images{COLORS.END}' if anims_match_images else f'   {COLORS.YELLOW}complete anims DON\'T match images{COLORS.END}')
        # if not anims_match_images:
        print(f'   {len(anim_runs)} anim runs', end='')
        if (len(anim_runs) < 100): print(f': {format_runs(anim_runs)}')
        else: print()
        # check frames integrity
        if pwd: # only if working directory is given, are we dealing with extracted files
            paths = list(frames)
            paths.sort()
            error_nos = []
            errors = []
            ok = 0
            partitions = partition_framelist(paths) # dict with frames grouped by animation sequence
            for no, anim_frames in partitions.items():
                paths = list(map(lambda x: os.path.join(pwd, x), anim_frames))
                anim_errors = check_pngs(paths)
                if len(anim_errors) > 0:
                    error_nos.append(no)
                    errors.append(anim_errors)
                else:
                    ok += 1
                if no % 1 == 0:
                    print(f'   anims verified: {ok}, corrupt: {len(error_nos)}')    
            if len(errors) == 0:
                print(f'   {COLORS.GREEN}frame integrity VERIFIED{COLORS.END}')
            else:
                print(f'   {COLORS.RED}frame integrity NOT verified{COLORS.END}')
                print(f'   {len(error_nos)} animations with error(s):')
                print(f'   {", ".join(map(str, errors))}')

def check_png(path):
    code = run_cmd(f"pngcheck '{path}' > /dev/null")
    return code == 0

def check_pngs(files):
    errors = []
    ok = 0
    for i, file in enumerate(files):
        if not check_png(file): 
            errors.append(file)
            print(f'      {COLORS.RED}CORRUPT image: {file}{COLORS.END}')
        else: ok += 1
        if (i+1) % 100 == 0:
            print(f'      images verified: {ok}/{len(files)}, corrupt: {len(errors)}/{len(files)}')
    return errors

def check_json(path):
    try:
        with open(path, 'r') as file:
            obj = json.load(file)
            if '_nft_metadata' not in obj: return False
            return True
    except json.JSONDecodeError:
        return False

def check_jsons(files):
    errors = []
    ok = 0
    for i, file in enumerate(files):
        if not check_json(file): 
            errors.append(file)
            print(f'      {COLORS.RED}CORRUPT json: {file}{COLORS.END}')
        else: ok += 1
        if (i+1) % 100 == 0:
            print(f'      json verified: {ok}/{len(files)}, corrupt: {len(errors)}/{len(files)}')
    return errors

def limit_range(names, from_=0, to=0):
    def in_range(name):
        basename = os.path.os.path.basename(name)
        noext =  os.path.splitext(basename)[0]
        num = int(noext)
        if from_ > 0 and num < from_: return False
        if to > 0 and num > to: return False
        return True
    return list( filter(in_range, names) )
    
def run_archive(target, src_folder, dest_folder, use_001=False):
    target_to_folder = {
        'meta': TAR_META_DIR,
        'sheets': OUT_SHEETS_DIR,
        'images': TAR_IMAGES_DIR,
        'movies': OUT_MOVIES_DIR,
        'frames': TAR_FRAMES_DIR
    }
    fname = target_to_folder[target]
    in_folder_relative = os.path.join(src_folder, fname)
    if not os.path.exists(in_folder_relative):
        print (f'Archiving {target}: Skipping. Folder doesn\'t exist: {in_folder_relative}')
        return
    zip_path_relative = os.path.join(dest_folder, fname) + '.zip'
    zip_path_absolute = os.path.join( os.path.abspath(dest_folder), fname) + '.zip'
    if os.path.exists(zip_path_absolute): os.remove(zip_path_absolute) # need to remove manually, since zip won't overwrite
    print(f'Archiving {target}: {in_folder_relative} -> {zip_path_relative}{"[.001]" if use_001 else ""}')
    if not use_001: run_cmd(f'cd {src_folder}; zip -s {ZIP_SPLIT} -r \'{zip_path_absolute}\' {fname}') # need to cd into the folder, so the zip contains correct relative paths
    else:
        s = '-d' if sys.platform == 'darwin' else '--numeric-suffixes=1' # starting index not supported on darwin (will start at 000)
        run_cmd(f'cd {src_folder}; zip -r - {fname} | split {s} -a 3 -b {ZIP_SPLIT.upper()} - \'{zip_path_absolute}.\'')
        parts = glob.glob(f'{zip_path_absolute}.*')
        # remove suffix if only one file
        if len(parts) == 1:
            os.rename( parts[0], os.path.splitext(parts[0])[0] )
        # rename on darwin so index starts at 001 (no need to rename if suffix was already removed)
        elif sys.platform == 'darwin':     
            parts.sort(reverse=True)
            for part in parts:
                split = os.path.splitext(part)
                new_num = int( split[1][1:] ) + 1 
                new_suffix = f'.{new_num:03d}'
                os.rename( part, split[0] + new_suffix )


extract_default = True
sheets_default = True
movies_default = True

if __name__ == '__main__':
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGQUIT, signal_handler)
    
    parser = argparse.ArgumentParser()
    parser.add_argument('in_folder') # folder of tar files or of extracted files (if generating only i.e. without extracting first)
    parser.add_argument('out_folder', nargs='?', default='') # folder for extracted files and/or generated file
    parser.add_argument('--extract', action='store_true', default=False)
    parser.add_argument('--sheets', action='store_true', default=False)
    parser.add_argument('--movies',  action='store_true', default=False)
    parser.add_argument('-y', action='store_true', default=False)
    
    parser.add_argument('--check_tars', action='store_true', default=False)
    parser.add_argument('--check_extracted', action='store_true', default=False)
    parser.add_argument('--check_integrity', action='store_true', default=False)
    parser.add_argument('--archive', type=str, default=None) # 'all', 'images', 'frames', 'movies', 'meta', 'sheets'
    parser.add_argument('--001', action='store_true', default=False)
    
    # valid for extract, sheets and movies (for extract :counts tar files, not image sequence numbers)
    parser.add_argument('--from', type=int, default=0)
    parser.add_argument('--to', type=int, default=0)
    
    parser.add_argument('--tar_v', action='store_true', default=False) # valid for extract (tar option v, verbose)
    parser.add_argument('--tar_k', action='store_true', default=False) # valid for extract (tar option k, keep, i.d. don't overwrite)
    
    args = parser.parse_args()
    # print(args)
    # fix_tars = args.fix_tars
    check_tars = args.check_tars
    check_extracted = args.check_extracted
    check_integrity = args.check_integrity
    extract = args.extract
    sheets = args.sheets
    movies = args.movies
    archive = args.archive
    
    # print(args)
    
    # if none of the options are enabled use default options
    if (not extract and not sheets and not movies and not check_tars and not check_extracted and not check_integrity and not archive):
        extract = extract_default
        sheets = sheets_default
        movies = movies_default
        
    in_folder = args.in_folder.rstrip('/') # make sure to remove trailing / (will have problems with basename otherwise)
    in_folder_type = input_dir_type(in_folder)
    if in_folder_type == 'nonexistent':
        print(f'Input folder does not exist: {in_folder}')
        print('Exiting')
        exit()
        
    if extract or check_tars:
        tar_folder = in_folder
        extract_folder = os.path.join( args.out_folder, os.path.basename(in_folder) + OUTDIR_SUFFIX )
        out_folder = extract_folder
    else:
        tar_folder = None
        extract_folder = in_folder
        out_folder = in_folder if args.out_folder == '' else args.out_folder
    print(f'                   Input TAR Folder: {tar_folder if tar_folder != None else "-"}')
    print(f'Extract Folder (Images/Frames/Meta): {extract_folder}')
    print(f'      Output Folder (Sheets/Movies): {out_folder}')
    if (not args.y):
        cont = input('Continue (y/n)? ')
        if (cont.lower() != 'y'): 
            print('Exiting')
            exit()
    
    global start_time
    start_time = time.time()
    
    if check_tars:
        tars = list_files(tar_folder, '*.tar')
        print()
        print(f'CHECK_TARS: {len(tars)} TAR files found')
        if len(tars) > 0:
            files = list_tar_contents(tars, remove_duplicates=True)
            check_files(files)
        else:
            print('Exiting')
            exit()
    
    print()
    if extract:
        tars = list_files(tar_folder, '*.tar')
        # tars = tars[0:1]
        print(f'EXTRACT: {len(tars)} TAR files found')
        if len(tars) > 0:
            os.makedirs(extract_folder, exist_ok=True);
            extract_tars(tars, out_folder, getattr(args,'from'), args.to)
        else:
            print('Exiting')
            exit()
    else:
        print('Skipping EXTRACT')
    
    if check_extracted or check_integrity:
        print()
        print(f'CHECK_FILES: Checking {extract_folder}')
        files = list_files_recursive(extract_folder)
        # print(files)
        # exit()
        check_files(files, extract_folder if check_integrity else None)
    
    print()
    if sheets:
        pngs = list_files( os.path.join(extract_folder, TAR_IMAGES_DIR), '[0-9]*.png' )
        pngs_limited = limit_range( pngs, getattr(args, 'from'), args.to )
        if len(pngs_limited) == len(pngs): print(f'SHEETS: {len(pngs)} PNG files found')
        else: print(f'SHEETS: {len(pngs_limited)}/{len(pngs)} PNG files to be processed')
        if len(pngs_limited) > 0:
            sheets_dir = os.path.join(out_folder, OUT_SHEETS_DIR)
            os.makedirs(sheets_dir, exist_ok=True);
            create_contactsheets(pngs_limited, sheets_dir)
    else:
        print('Skipping SHEETS')
    
    print()
    if movies:
        anim_folders = list_folders( os.path.join(extract_folder, TAR_FRAMES_DIR), '[0-9]*' )
        anim_folders_limited = limit_range( anim_folders, getattr(args, 'from'), args.to )
        if len(anim_folders_limited) == len(anim_folders): print(f'MOVIES: {len(anim_folders)} animation folders found')
        else: print(f'MOVIES: {len(anim_folders_limited)}/{len(anim_folders)} animation folders to be processed')
        # anim_folders_limited = anim_folders_limited[0:1]
        if len(anim_folders_limited) > 0:
            movies_dir = os.path.join(out_folder, OUT_MOVIES_DIR)
            os.makedirs(movies_dir, exist_ok=True);
            create_movies(anim_folders_limited, movies_dir)
    else:
        print('Skipping MOVIES')
    
    
    if archive: 
        all_targets = ['meta', 'sheets', 'images', 'movies', 'frames']
        # 'all', 'images', 'frames', 'movies', 'meta', 'sheets'
        targets = archive.split(',')
        targets = list( map(lambda x: x.strip(), targets) )
        if 'all' in targets: targets = all_targets
        targets = list( filter(lambda x: x in all_targets, targets) )
        if len(targets) == 0:
            print(f'\nARCHIVE: no valid targets given ({", ".join(all_targets)}, all)')
        else: 
            print(f'\nARCHIVE: {", ".join(targets)}')
            for target in targets:
                run_archive(target, extract_folder, out_folder, getattr(args, '001'))
    
    print()
    print_elapsed()
