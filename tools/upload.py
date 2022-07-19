#!/usr/bin/env python3

RETRIES = 10

import subprocess
import argparse
import os.path
import signal
import time
import datetime
import math


class COLORS:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'


def run_cmd(cmd, return_exitcode_only=True):
    # os.system is simple, but will signals won't work
    # shell allows to specify cmd as a single string, as opposed to a list of args
    completed_process = subprocess.run(cmd, shell=True)
    if return_exitcode_only: return completed_process.returncode
    else: return completed_process


# check if target_folder exists and create if not
def make_dir(target_folder, silent = True, prefix = ''):
    print(f'{prefix}Creating folder {target_folder}')
    if target_folder == '/': return 0
    redir = ' > /dev/null 2>&1' if silent else ''
    code = run_cmd(f"dbxcli ls '{target_folder}'{redir}")
    if code != 0:
        code = run_cmd(f"dbxcli mkdir '{target_folder}'")
        if code != 0:
            print(f'Error creating folder (code {code})')
            return code
    return 0


def upload_file(src, dst, silent = True, prefix = ''):
    print(f'{prefix}Uploading {src} -> {dst}')
    redir = ' > /dev/null 2>&1' if silent else ''
    return run_cmd(f"dbxcli put '{src}' '{dst}'{redir}")


def put(source_path, target_folder = '/', retry = RETRIES):
    if not os.path.exists(source_path):
        print(f'File/folder doesn\'t exists: {source_path}')
    
    count = 0
    ok = 0
    fail = 0
    fails = []
    
    def print_stats(prefix = ''):
        if (fail == 0):
            print(f'{prefix}Total: {count}   {COLORS.GREEN}Ok: {ok}{COLORS.END}   Failed: {fail}')
        else:
            print(f'{prefix}Total: {count}   Ok: {ok}   {COLORS.RED}Failed: {fail}{COLORS.END}')
    
    if os.path.isdir(source_path):
        # we want to copy the dir itself, append it to the target
        if source_path.endswith('/'): source_path = source_path[:-1]
        target_folder = os.path.join(target_folder, os.path.basename(source_path))
    
    if os.path.isdir(source_path):
        # upload contents of folder
        for root, dirs, files in os.walk(source_path):
            files.sort()
            target_root = root[len(source_path):]
            if target_root.startswith('/'): target_root = target_root[1:] # remove leading /, won't join otherwise
            files = list( filter(lambda x: not x.startswith('.'), files) )
            if len(files) > 0:
                for file in files:
                    count += 1
                    if file.startswith('.'): continue
                    src = os.path.join(root, file)
                    dst = os.path.join(target_folder, target_root, file)
                    code = -1
                    tries = 0
                    while code != 0 and tries < retry + 1:
                        if tries > 0: print(f'   Retry {tries}/{retry}')
                        small = os.path.getsize(src) < 100 * 1_000_000 # 100 MB
                        code = upload_file(src, dst, silent=small, prefix=f'({count}) ')
                        tries += 1
                    if code == 0: ok += 1
                    else:
                        fail += 1
                        print(f'   {COLORS.RED}FAILED ({code}){COLORS.END}')
                        fails.append(f"./upload.py '{src}' '{os.path.dirname(dst)}'")
                    print_stats()
                        
            else: # empty dir, create it
                count += 1
                dst = os.path.join(target_folder, target_root)
                code = make_dir(dst, prefix=f'({count}) ')
                if code == 0:
                    ok += 1
                else:
                    fail += 1
                    print(f'   {COLORS.RED}FAILED ({code}){COLORS.END}')
                    fails.append(f"EMPTY DIR: '{dst}'")
                print_stats()
    else:
        # single file
        src = source_path
        dst = os.path.join( target_folder, os.path.basename(source_path) )
        small = os.path.getsize(src) < 100 * 1_000_000 # 100 MB
        code = upload_file(src, dst, silent=small)
        count += 1
        if code == 0:
            ok += 1
        else:
            fail += 1
            print(f'   FAILED')
            fails.append(f"./upload.py '{src}' '{os.path.dirname(dst)}'")
        print_stats()
    
    if len(fails) > 0:
        print()
        print('To retry fails, type:')
        print('\n'.join(fails))


def print_elapsed():
    global start_time
    elapsed = datetime.timedelta(seconds = math.floor(time.time()-start_time) )
    print(f'Elapsed time: {str(elapsed)}')


def signal_handler(sig, stack=None):
    print(f'\nCaught signal {signal.Signals(sig).name}: Exiting')
    print_elapsed()
    exit(1)


if __name__ == '__main__':
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGQUIT, signal_handler)
    
    parser = argparse.ArgumentParser()
    parser.add_argument('source_path') # local source path. a file or a folder
    parser.add_argument('dest_folder', nargs='?', default='/') # remote destination folder 
    args = parser.parse_args()
    
    global start_time
    start_time = time.time()
    put(args.source_path, args.dest_folder)
    print()
    print_elapsed()
