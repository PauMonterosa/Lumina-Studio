$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$library = Join-Path $root "library\pdfs"

function Get-LuminaFile([string]$rel, [string]$url) {
    $dest = Join-Path $library ($rel -replace "/", "\\")
    $dir = Split-Path -Parent $dest
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    if (Test-Path $dest) {
        Write-Host "YA EXISTE: $rel" -ForegroundColor DarkGray
        return
    }
    try {
        Write-Host "Descargando: $rel" -ForegroundColor Cyan
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -Headers @{"User-Agent"="Mozilla/5.0 LuminaStudio/1.0"}
        if ((Get-Item $dest).Length -lt 1000) { throw "archivo demasiado pequeño" }
        Write-Host "OK: $rel" -ForegroundColor Green
    } catch {
        Remove-Item $dest -Force -ErrorAction SilentlyContinue
        Write-Host "AVISO: no se pudo descargar $rel" -ForegroundColor Yellow
        Write-Host "       $url" -ForegroundColor DarkGray
    }
}

Get-LuminaFile "nanotechnologies/course_guides/UPC_230484_Nanotechnology_Course_Guide.pdf" "https://www.upc.edu/grau/guiadocent/pdf/ing/230484/nanotechnology.pdf"
Get-LuminaFile "nanotechnologies/course_guides/UPC_NTECH_Official_Syllabus.pdf" "https://enginyeriafisica.etsetb.upc.edu/ca/estudis/optatives/ntech/programa-ntech.pdf"
Get-LuminaFile "quantum_technologies/course_guides/UPC_QTech_Official_Syllabus.pdf" "https://enginyeriafisica.etsetb.upc.edu/ca/estudis/optatives/qtech/programa-ntech"
Get-LuminaFile "quantum_technologies/course_guides/UPC_230491_Quantum_Technologies_Course_Guide.pdf" "https://www.upc.edu/grau/guiadocent/pdf/ing/230491/quantum-technologies.pdf"
Get-LuminaFile "quantum_technologies/open_access/Preskill_Quantum_Information_Ch1.pdf" "https://www.preskill.caltech.edu/ph229/notes/chap1.pdf"
Get-LuminaFile "quantum_technologies/open_access/Preskill_Quantum_Information_Ch2.pdf" "https://www.preskill.caltech.edu/ph229/notes/chap2.pdf"
Get-LuminaFile "quantum_technologies/open_access/Preskill_Quantum_Information_Ch3.pdf" "https://www.preskill.caltech.edu/ph229/notes/chap3.pdf"
Get-LuminaFile "quantum_technologies/open_access/Preskill_Quantum_Information_Ch4.pdf" "https://www.preskill.caltech.edu/ph229/notes/chap4.pdf"
Get-LuminaFile "quantum_technologies/open_access/Preskill_Quantum_Information_Ch5.pdf" "https://www.preskill.caltech.edu/ph229/notes/chap5.pdf"
Get-LuminaFile "quantum_technologies/open_access/Preskill_Quantum_Information_Ch6.pdf" "https://www.preskill.caltech.edu/ph229/notes/chap6.pdf"
Get-LuminaFile "quantum_technologies/open_access/Preskill_Quantum_Information_Ch7.pdf" "https://www.preskill.caltech.edu/ph229/notes/chap7.pdf"
Get-LuminaFile "microelectronics_design/course_guides/UPC_230736_Introduction_to_Microelectronic_Design_RELATED_Bridge_Guide.pdf" "https://telecos.upc.edu/en/shared/master/mee-_90/mee-subjects/bridge_guia_docent_imd.pdf"
Get-LuminaFile "cpia/course_guides/UPC_230490_CPIA_Course_Guide.pdf" "https://www.upc.edu/grau/guiadocent/pdf/esp/230490/programacion-de-computadores-y-sus-aplicaciones.pdf"
Get-LuminaFile "cpia/course_guides/UPC_CPIA_Official_Syllabus.pdf" "https://enginyeriafisica.etsetb.upc.edu/ca/estudis/optatives/cpia/cpiaT22.pdf"
Get-LuminaFile "cpia/open_access/Fundamentos_de_Ordenadores_Programacion_en_C_Jimenez_Otero_UPC.pdf" "https://upcommons.upc.edu/bitstream/handle/2099.3/36593/9788476539965.pdf?sequence=1"
Get-LuminaFile "cpia/open_access/OpenMP_API_Specification_5.0.pdf" "https://www.openmp.org/wp-content/uploads/OpenMP-API-Specification-5.0.pdf"
Get-LuminaFile "biophotonics/course_guides/UPC_230482_Biomedical_Photonics_Course_Guide.pdf" "https://www.upc.edu/grau/guiadocent/pdf/ing/230482/biomedical-photonics.pdf"
Get-LuminaFile "biophotonics/course_guides/UPC_BIOPHOT_Official_Syllabus.pdf" "https://enginyeriafisica.etsetb.upc.edu/ca/estudis/optatives/biophot/programa-biophot.pdf"

Write-Host ""
Write-Host "Biblioteca Q7 preparada." -ForegroundColor Green
Write-Host "Los libros comerciales NO se han descargado; consulta BIBLIOGRAPHY.md en cada asignatura." -ForegroundColor Yellow

# Reindexar PDF RAG si el backend está encendido
try {
    Invoke-RestMethod -Uri "http://localhost:3001/api/rag/pdf/reindex" -Method POST -TimeoutSec 120 | Out-Null
    Write-Host "PDF RAG reindexado." -ForegroundColor Green
} catch {
    Write-Host "Backend no disponible: el PDF RAG se indexará al iniciarlo/reindexarlo más tarde." -ForegroundColor DarkGray
}