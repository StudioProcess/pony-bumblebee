#!/usr/bin/env python3

# [1, 974, 1947, 2920, 3893, 4867, 5840, 6813, 7786, 8760]
# count >= 2
def pick_count(count=10, num=8760, offset = 1):
    r = list( range(num) )
    step = (num - 1) / (count - 1)
    out = []
    idx = 0
    while idx < num:
        out.append( r[round(idx)] + offset )
        idx += step
    return out

# [1, 1001, 2001, 3001, 4001, 5001, 6001, 7001, 8001, 8760]
def pick_step(step=1000, num=8760, offset = 1, include_last = True):
    r = list( range(num) )
    out = []
    idx = 0
    while idx < num:
        out.append( r[int(idx)] + offset )
        idx += step
    if (include_last and out[-1] != r[-1] + offset):
        out.append(r[-1] + offset)
    return out

# [1, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 8760]
def pick_step_beauty(step=1000, num=8760, offset = 1, include_first = True, include_last = True):
    first = offset
    last = num - 1 + offset
    out = []
    if include_first and step != first: out.append(first)
    current = step
    while current <= last:
        out.append(current)
        current += step    
    if include_last and out[-1] != last: out.append(last)
    return out

def pick_from_to(count=10, _from=1, to=8760):
    return pick_count(count, num=to-_from+1, offset=_from)

def out(array):
    print( ', '.join(map(str, array)) )

if __name__ == '__main__':
    count = 10
    import sys
    if len(sys.argv) >= 2:
        count = int(sys.argv[1])

    out( pick_from_to(count, 1, 100) )
    out( pick_from_to(count, 101, 1000) )
    out( pick_from_to(count, 1001, 3200) )
    out( pick_from_to(count, 3201, 5800) )
    out( pick_from_to(count, 5801, 8760) )
    print()
    out( pick_from_to(count, 1, 100) )
    out( pick_from_to(count, 101, 101+99) )
    out( pick_from_to(count, 1001, 1001+99) )
    out( pick_from_to(count, 3201, 3201+99) )
    out( pick_from_to(count, 5801, 5801+99) )
